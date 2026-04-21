"""
MagPie — FastAPI backend
Wraps the crawler + LLM pipeline as a REST API consumed by
both the Web UI and the Obsidian plugin.

Run with:
  uvicorn api.server:app --reload --port 8000
"""

import asyncio
import os
import sys
from typing import Optional

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Allow imports from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from crawler import crawl_url
from llm_processor import process_content
from obsidian_client import Note, ObsidianClient

load_dotenv()

app = FastAPI(title="MagPie API", version="1.0.0")

# Allow the React dev server and Obsidian plugin to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_config():
    with open("config.yaml") as f:
        return yaml.safe_load(f)


def get_obsidian_client(cfg):
    return ObsidianClient(
        base_url=cfg["obsidian"]["base_url"],
        api_key=os.environ.get("OBSIDIAN_API_KEY", cfg["obsidian"]["api_key"]),
    )


# ── Models ────────────────────────────────────────────────────────────────────

class CrawlRequest(BaseModel):
    url: str
    folder: Optional[str] = None  # override vault folder


class CrawlResult(BaseModel):
    url: str
    title: str
    summary: str
    tags: list[str]
    links: list[str]
    vault_path: str
    success: bool
    error: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    limit: int = 5


class StatusResponse(BaseModel):
    obsidian_connected: bool
    anthropic_configured: bool
    vault_folder: str
    model: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"name": "MagPie API", "version": "1.0.0", "status": "running"}


@app.get("/status", response_model=StatusResponse)
def status():
    """Health check — used by Web UI on load."""
    cfg = get_config()
    import httpx
    import anthropic

    obsidian_ok = False
    try:
        obsidian_key = os.environ.get("OBSIDIAN_API_KEY", "")
        r = httpx.get(
            f"{cfg['obsidian']['base_url']}/",
            headers={"Authorization": f"Bearer {obsidian_key}"},
            verify=False, timeout=3,
        )
        obsidian_ok = r.status_code == 200
    except Exception:
        pass

    return StatusResponse(
        obsidian_connected=obsidian_ok,
        anthropic_configured=bool(os.environ.get("ANTHROPIC_API_KEY")),
        vault_folder=cfg["obsidian"]["vault_folder"],
        model=cfg["llm"]["model"],
    )


@app.post("/crawl", response_model=CrawlResult)
async def crawl(req: CrawlRequest):
    """Crawl a URL, process with Claude, save to Obsidian."""
    cfg = get_config()
    folder = req.folder or cfg["obsidian"]["vault_folder"]

    # 1. Crawl
    crawl_result = await crawl_url(req.url)
    if not crawl_result.success:
        raise HTTPException(status_code=422, detail=f"Crawl failed: {crawl_result.error}")

    # 2. Process with LLM
    processed = process_content(
        raw_markdown=crawl_result.markdown,
        source_url=req.url,
        prompt_template=cfg["llm"]["prompt"],
        model=cfg["llm"]["model"],
    )
    if not processed.success:
        raise HTTPException(status_code=422, detail=f"LLM processing failed: {processed.error}")

    # 3. Save to Obsidian
    note = Note(
        title=processed.title,
        content=processed.content,
        folder=folder,
        tags=processed.tags,
        links=processed.links,
        source_url=req.url,
        summary=processed.summary,
    )
    obsidian = get_obsidian_client(cfg)
    try:
        result = obsidian.create_note(note)
        vault_path = result["path"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save note: {e}")

    return CrawlResult(
        url=req.url,
        title=processed.title,
        summary=processed.summary,
        tags=processed.tags,
        links=processed.links,
        vault_path=vault_path,
        success=True,
    )


@app.get("/notes")
def list_notes(folder: Optional[str] = None):
    """List notes in the vault folder."""
    cfg = get_config()
    obsidian = get_obsidian_client(cfg)
    target = folder or cfg["obsidian"]["vault_folder"]
    try:
        notes = obsidian.list_notes(target)
        return {"folder": target, "notes": notes, "count": len(notes)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/crawl/batch")
async def crawl_batch(urls: list[str], folder: Optional[str] = None):
    """Crawl multiple URLs concurrently."""
    cfg = get_config()
    max_pages = cfg.get("crawl", {}).get("max_pages", 10)
    urls = urls[:max_pages]  # enforce limit

    tasks = [crawl(CrawlRequest(url=u, folder=folder)) for u in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return {
        "total": len(urls),
        "results": [
            r if not isinstance(r, Exception) else {"success": False, "error": str(r)}
            for r in results
        ],
    }