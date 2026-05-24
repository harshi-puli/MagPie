"""
MagPie — FastAPI backend v2
Run with:
  python -m uvicorn api.backend:app --reload --port 8000
"""

import asyncio
import os
import sys
from datetime import datetime
from typing import Optional

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from crawler import crawl_url
from llm_processor import process_content
from nlp_processor import process_free
from obsidian_client import Note, ObsidianClient
from api.github_client import fetch_repo, extract_key_concepts

load_dotenv()

app = FastAPI(title="MagPie API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory history (swap for Supabase later) ───────────────────────────────
_history: dict[str, list] = {}


def get_config():
    with open("config.yaml") as f:
        return yaml.safe_load(f)


def get_obsidian_client(cfg):
    return ObsidianClient(
        base_url=cfg["obsidian"]["base_url"],
        api_key=os.environ.get("OBSIDIAN_API_KEY", cfg["obsidian"]["api_key"]),
    )


def save_to_history(session_id: str, entry: dict):
    if session_id not in _history:
        _history[session_id] = []
    _history[session_id].insert(0, entry)
    _history[session_id] = _history[session_id][:100]


# ── Models ────────────────────────────────────────────────────────────────────

class CrawlRequest(BaseModel):
    url: str
    folder: Optional[str] = None
    save_history: bool = True
    session_id: Optional[str] = None
    anthropic_key: Optional[str] = None   # user's own key for pro tier
    mode: str = "surface"                 # "surface" | "deep_dive"
    mode: str = "surface"                 # "surface" | "deep_dive" 


class ProjectRequest(BaseModel):
    github_url: str
    folder: Optional[str] = None
    save_history: bool = True
    save_to_obsidian: bool = True
    session_id: Optional[str] = None


class StatusResponse(BaseModel):
    obsidian_connected: bool
    anthropic_configured: bool
    vault_folder: str
    model: str
    free_tier_available: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"name": "MagPie API", "version": "2.0.0", "status": "running"}


@app.get("/status", response_model=StatusResponse)
def status():
    cfg = get_config()
    import httpx
    obsidian_ok = False
    try:
        r = httpx.get(
            f"{cfg['obsidian']['base_url']}/",
            headers={"Authorization": f"Bearer {os.environ.get('OBSIDIAN_API_KEY','')}"},
            verify=False, timeout=3,
        )
        obsidian_ok = r.status_code == 200
    except Exception:
        pass

    free_tier_ok = False
    try:
        import spacy
        spacy.load("en_core_web_sm")
        free_tier_ok = True
    except Exception:
        pass

    return StatusResponse(
        obsidian_connected=obsidian_ok,
        anthropic_configured=bool(os.environ.get("ANTHROPIC_API_KEY")),
        vault_folder=cfg["obsidian"]["vault_folder"],
        model=cfg["llm"]["model"],
        free_tier_available=free_tier_ok,
    )


@app.post("/crawl")
async def crawl(req: CrawlRequest):
    """
    Crawl any URL.
    - Free tier: spaCy + TextRank (no API key needed)
    - Pro tier: Claude summarization (pass anthropic_key explicitly)
    """
    cfg = get_config()
    folder = req.folder or cfg["obsidian"]["vault_folder"]

    # 1. Crawl
    crawl_result = await crawl_url(req.url)
    if not crawl_result.success:
        raise HTTPException(status_code=422, detail=f"Crawl failed: {crawl_result.error}")

    # 2. Decide which processor to use
    # ONLY use Claude if the user explicitly passed their key from the UI
    anthropic_key = req.anthropic_key
    use_claude = bool(anthropic_key)

    if use_claude:
        # ── Pro tier: Claude ──────────────────────────────────────────────────
        original_key = os.environ.get("ANTHROPIC_API_KEY")
        os.environ["ANTHROPIC_API_KEY"] = anthropic_key

        processed = process_content(
            raw_markdown=crawl_result.markdown,
            source_url=req.url,
            prompt_template=cfg["llm"]["prompt"],
            model=cfg["llm"]["model"],
        )

        # Restore original key
        if original_key:
            os.environ["ANTHROPIC_API_KEY"] = original_key
        else:
            os.environ.pop("ANTHROPIC_API_KEY", None)

        if not processed.success:
            raise HTTPException(status_code=422, detail=f"Claude error: {processed.error}")

        title         = processed.title
        summary       = processed.summary
        tags          = processed.tags
        links         = processed.links
        content       = processed.content
        tier          = "claude"
        key_terms     = []
        main_ideas    = []
        entities      = []
        related_links = []
        co_occurrences = []
        stats         = {}
        sentiment_arc = []
        questions     = []

    else:
        # ── Free tier: spaCy + TextRank ───────────────────────────────────────
        result = process_free(crawl_result.markdown, source_url=req.url)

        if not result.success:
            # Return a friendly error card instead of crashing
            # so the user sees WHY it failed (paywall, nav-only, etc.)
            return {
                "type": "article",
                "tier": "free",
                "url": req.url,
                "title": result.title or req.url.split("/")[-1] or "Page",
                "summary": f"⚠️ {result.error}",
                "tags": [], "links": [], "key_terms": [], "main_ideas": [],
                "entities": [], "related_links": [], "co_occurrences": [],
                "stats": {}, "sentiment_arc": [], "questions": [],
                "vault_path": "",
                "crawled_at": datetime.utcnow().isoformat(),
                "success": False,
                "error": result.error,
            }

        title         = result.title
        summary       = result.summary
        tags          = result.tags
        links         = result.links
        content       = result.content
        tier          = "free"
        key_terms     = result.key_terms
        main_ideas    = result.main_ideas
        entities      = result.entities
        related_links = result.related_links
        co_occurrences = result.co_occurrences
        stats         = result.stats
        sentiment_arc = result.sentiment_arc
        questions     = result.questions

    # 3. Save to Obsidian
    vault_path = ""
    try:
        note = Note(
            title=title,
            content=content,
            folder=folder,
            tags=tags,
            links=links,
            source_url=req.url,
            summary=summary,
            mode=req.mode,
            key_terms=key_terms,
            main_ideas=main_ideas,
            questions=questions,
            sentiment_arc=sentiment_arc,
            stats=stats,
            related_links=related_links,
            entities=entities,
        )
        obsidian = get_obsidian_client(cfg)
        save_result = obsidian.create_note(note)
        vault_path = save_result["path"]
    except Exception as e:
        vault_path = f"(Obsidian offline: {e})"

    # 4. Build history entry
    entry = {
        "type": "article",
        "tier": tier,
        "url": req.url,
        "title": title,
        "summary": summary,
        "tags": tags,
        "links": links,
        "key_terms": key_terms,
        "main_ideas": main_ideas,
        "entities": entities,
        "related_links": related_links,
        "co_occurrences": co_occurrences,
        "stats": stats,
        "sentiment_arc": sentiment_arc,
        "questions": questions,
        "vault_path": vault_path,
        "crawled_at": datetime.utcnow().isoformat(),
        "mode": req.mode,
        "mode": req.mode,
        "success": True,
    }

    if req.save_history and req.session_id:
        save_to_history(req.session_id, entry)

    return entry


@app.post("/project")
def analyze_project(req: ProjectRequest):
    """Analyze a GitHub repo — always free, no Claude needed."""
    cfg = get_config()

    try:
        repo = fetch_repo(req.github_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"GitHub fetch failed: {str(e)}")

    key_concepts = extract_key_concepts(repo.readme, repo.topics, repo.tech_stack)
    repo.key_concepts = key_concepts

    readme_preview = repo.readme[:3000] + ("..." if len(repo.readme) > 3000 else "")
    lang_list = ", ".join(f"[[{l}]]" for l in list(repo.languages.keys())[:5])
    concept_links = "  ".join(f"[[{c}]]" for c in key_concepts[:12])
    contrib_list = "\n".join(
        f"- [{c['login']}]({c['url']}) — {c['contributions']} commits"
        for c in repo.contributors[:5]
    )

    recent = repo.commit_activity[-12:] if len(repo.commit_activity) >= 12 else repo.commit_activity
    max_commits = max(recent) if recent else 1
    bars = "▁▂▃▄▅▆▇█"
    sparkline = "".join(bars[min(int(w / max(max_commits, 1) * 7), 7)] for w in recent)
    activity = "active" if sum(recent) > 10 else "quiet"

    note_content = f"""## About
{repo.description}

⭐ {repo.stars:,} stars · 🍴 {repo.forks:,} forks · 🐛 {repo.open_issues:,} open issues
📄 {repo.license or "No license"} · 🌿 `{repo.default_branch}`

## Tech Stack
{lang_list}

## Key Concepts
{concept_links}

## Commit Activity (last 12 weeks)
`{sparkline}` ({activity})

## Top Contributors
{contrib_list}

## README
{readme_preview}

---
## Related Concepts
{concept_links}
"""

    vault_path = ""
    if req.save_to_obsidian:
        folder = req.folder or cfg["obsidian"]["vault_folder"]
        note = Note(
            title=repo.full_name,
            content=note_content,
            folder=f"{folder}/Projects",
            tags=repo.topics[:5] + ([repo.primary_language.lower()] if repo.primary_language else []),
            links=key_concepts,
            source_url=req.github_url,
            summary=repo.description,
        )
        obsidian = get_obsidian_client(cfg)
        try:
            save_result = obsidian.create_note(note)
            vault_path = save_result["path"]
        except Exception:
            pass

    entry = {
        "type": "project",
        "url": req.github_url,
        "title": repo.full_name,
        "description": repo.description,
        "stars": repo.stars,
        "forks": repo.forks,
        "primary_language": repo.primary_language,
        "languages": list(repo.languages.keys())[:6],
        "topics": repo.topics,
        "tech_stack": repo.tech_stack[:15],
        "key_concepts": key_concepts,
        "contributors": repo.contributors[:5],
        "commit_activity": repo.commit_activity[-12:],
        "sparkline": sparkline,
        "activity": activity,
        "readme_preview": repo.readme[:1000],
        "file_structure": repo.file_structure,
        "features": repo.features,
        "vault_path": vault_path,
        "crawled_at": datetime.utcnow().isoformat(),
        "success": True,
    }

    if req.save_history and req.session_id:
        save_to_history(req.session_id, entry)

    return entry


@app.get("/history/{session_id}")
def get_history(session_id: str):
    return {
        "session_id": session_id,
        "entries": _history.get(session_id, []),
        "count": len(_history.get(session_id, [])),
    }


@app.delete("/history/{session_id}")
def clear_history(session_id: str):
    _history.pop(session_id, None)
    return {"cleared": True}


@app.get("/graph/{session_id}")
def get_graph(session_id: str):
    entries = _history.get(session_id, [])
    nodes, edges = [], []
    seen_ids = {}
    node_id_counter = [0]

    def make_id(prefix):
        nid = f"{prefix}_{node_id_counter[0]}"
        node_id_counter[0] += 1
        return nid

    def get_or_create_leaf(label, leaf_type, url=""):
        key = f"{leaf_type}::{label.lower()}"
        if key not in seen_ids:
            nid = make_id(leaf_type)
            seen_ids[key] = nid
            nodes.append({"id": nid, "label": label, "type": leaf_type, "url": url, "summary": "", "cluster": None})
        return seen_ids[key]

    for entry in entries:
        entry_type = entry.get("type", "article")
        title = entry.get("title", entry.get("url", "Untitled"))[:45]
        root_id = make_id("root")
        nodes.append({
            "id": root_id,
            "label": title,
            "type": entry_type,
            "url": entry.get("url", ""),
            "summary": entry.get("description") or entry.get("summary", ""),
            "cluster": None,
        })

        if entry_type == "article":
            # Key Terms cluster
            key_terms = entry.get("key_terms") or []
            term_node_ids = {}
            if key_terms:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "🔑 Key Terms", "type": "cluster", "url": "", "summary": f"{len(key_terms)} terms", "cluster": "terms"})
                edges.append({"source": root_id, "target": cid, "cluster": "terms"})
                for term in key_terms[:6]:
                    lid = get_or_create_leaf(term, "term_item")
                    term_node_ids[term] = lid
                    edges.append({"source": cid, "target": lid, "cluster": "terms"})

            # Co-occurrence edges
            for co in (entry.get("co_occurrences") or []):
                ta, tb = co.get("term_a"), co.get("term_b")
                if ta in term_node_ids and tb in term_node_ids:
                    edges.append({
                        "source": term_node_ids[ta],
                        "target": term_node_ids[tb],
                        "cluster": "cooccurrence",
                        "strength": co.get("strength", 0.5),
                    })

            # Main Ideas cluster
            main_ideas = entry.get("main_ideas") or []
            if main_ideas:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "💡 Main Ideas", "type": "cluster", "url": "", "summary": f"{len(main_ideas)} ideas", "cluster": "ideas"})
                edges.append({"source": root_id, "target": cid, "cluster": "ideas"})
                for idea in main_ideas[:3]:
                    lid = get_or_create_leaf(idea, "idea_item")
                    edges.append({"source": cid, "target": lid, "cluster": "ideas"})

            # Questions cluster
            questions = entry.get("questions") or []
            if questions:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "❓ Questions", "type": "cluster", "url": "", "summary": f"{len(questions)} questions", "cluster": "questions"})
                edges.append({"source": root_id, "target": cid, "cluster": "questions"})
                for q in questions[:4]:
                    lid = get_or_create_leaf(q, "question_item")
                    edges.append({"source": cid, "target": lid, "cluster": "questions"})

            # Sentiment Arc cluster
            sentiment_arc = entry.get("sentiment_arc") or []
            if sentiment_arc:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "🌡 Sentiment", "type": "cluster", "url": "", "summary": "Emotional arc", "cluster": "sentiment"})
                edges.append({"source": root_id, "target": cid, "cluster": "sentiment"})
                prev_lid = None
                for section in sentiment_arc:
                    label = section.get("display", section.get("section", ""))
                    lid = get_or_create_leaf(label, "sentiment_item")
                    edges.append({"source": cid, "target": lid, "cluster": "sentiment"})
                    if prev_lid:
                        edges.append({"source": prev_lid, "target": lid, "cluster": "sentiment_arc"})
                    prev_lid = lid

            # Stats cluster
            stats = entry.get("stats") or {}
            if stats:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "📊 Stats", "type": "cluster", "url": "", "summary": f"{stats.get('reading_level','?')} level", "cluster": "stats"})
                edges.append({"source": root_id, "target": cid, "cluster": "stats"})
                for s in [
                    f"📖 {stats.get('reading_level','?')} level",
                    f"⏱ {stats.get('estimated_read_minutes','?')} min read",
                    f"📝 {stats.get('word_count','?')} words",
                    f"🧠 Richness: {stats.get('vocabulary_richness','?')}",
                ]:
                    lid = get_or_create_leaf(s, "stat_item")
                    edges.append({"source": cid, "target": lid, "cluster": "stats"})

            # Entities cluster
            entities = entry.get("entities") or []
            if entities:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "🏷 Entities", "type": "cluster", "url": "", "summary": f"{len(entities)} entities", "cluster": "entities"})
                edges.append({"source": root_id, "target": cid, "cluster": "entities"})
                for ent in entities[:5]:
                    lid = get_or_create_leaf(ent, "entity_item")
                    edges.append({"source": cid, "target": lid, "cluster": "entities"})

            # Related Links cluster
            related_links = entry.get("related_links") or []
            if related_links:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "🔗 Related Links", "type": "cluster", "url": "", "summary": f"{len(related_links)} links", "cluster": "links"})
                edges.append({"source": root_id, "target": cid, "cluster": "links"})
                for lnk in related_links:
                    lid = get_or_create_leaf(lnk.get("label", "Link"), "link_item", lnk.get("url", ""))
                    edges.append({"source": cid, "target": lid, "cluster": "links"})

            # Shared concept nodes (cross-entry wikilinks)
            for concept in (entry.get("links") or [])[:6]:
                lid = get_or_create_leaf(concept, "concept")
                edges.append({"source": root_id, "target": lid, "cluster": None})

        elif entry_type == "project":
            # Tech Stack
            tech = entry.get("tech_stack") or entry.get("languages") or []
            if tech:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "Tech Stack", "type": "cluster", "url": "", "summary": f"{len(tech)} technologies", "cluster": "tech"})
                edges.append({"source": root_id, "target": cid, "cluster": "tech"})
                for item in tech[:8]:
                    lid = get_or_create_leaf(item, "tech_item")
                    edges.append({"source": cid, "target": lid, "cluster": "tech"})

            # Features
            features = entry.get("features") or []
            if features:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "Features", "type": "cluster", "url": "", "summary": f"{len(features)} features", "cluster": "features"})
                edges.append({"source": root_id, "target": cid, "cluster": "features"})
                for feat in features[:6]:
                    lid = get_or_create_leaf(feat[:40], "feature_item")
                    edges.append({"source": cid, "target": lid, "cluster": "features"})

            # File Structure
            file_structure = entry.get("file_structure") or []
            if file_structure:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "Structure", "type": "cluster", "url": entry.get("url", ""), "summary": f"{len(file_structure)} entries", "cluster": "files"})
                edges.append({"source": root_id, "target": cid, "cluster": "files"})
                for f in file_structure[:10]:
                    label = f"{f.get('emoji','')} {f.get('name','')}".strip()
                    lid = get_or_create_leaf(label, "file_item", f.get("url", ""))
                    edges.append({"source": cid, "target": lid, "cluster": "files"})

            # Contributors
            contributors = entry.get("contributors") or []
            if contributors:
                cid = make_id("cluster")
                nodes.append({"id": cid, "label": "Contributors", "type": "cluster", "url": "", "summary": f"{len(contributors)} contributors", "cluster": "people"})
                edges.append({"source": root_id, "target": cid, "cluster": "people"})
                for c in contributors[:5]:
                    lid = get_or_create_leaf(c["login"], "contributor", c.get("url", ""))
                    edges.append({"source": cid, "target": lid, "cluster": "people"})

            # Key concepts (cross-entry)
            for concept in (entry.get("key_concepts") or [])[:6]:
                lid = get_or_create_leaf(concept, "concept")
                edges.append({"source": root_id, "target": lid, "cluster": None})

    return {"nodes": nodes, "edges": edges}


@app.get("/notes")
def list_notes(folder: Optional[str] = None):
    cfg = get_config()
    obsidian = get_obsidian_client(cfg)
    target = folder or cfg["obsidian"]["vault_folder"]
    try:
        notes = obsidian.list_notes(target)
        return {"folder": target, "notes": notes, "count": len(notes)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))