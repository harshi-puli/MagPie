"""
Web crawler using crawl4ai — returns LLM-friendly markdown.
pip install crawl4ai && crawl4ai-setup
"""

import asyncio
from dataclasses import dataclass
from typing import Optional

try:
    from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
    CRAWL4AI_AVAILABLE = True
except ImportError:
    CRAWL4AI_AVAILABLE = False

import httpx
from rich.console import Console

console = Console()


@dataclass
class CrawlResult:
    url: str
    title: str
    markdown: str
    links: list[str]
    success: bool
    error: Optional[str] = None


async def crawl_url(url: str) -> CrawlResult:
    """Crawl a single URL and return clean markdown."""
    if not CRAWL4AI_AVAILABLE:
        # Fallback: basic httpx fetch (no JS rendering)
        console.print(f"[yellow]crawl4ai not installed, using basic fetch for {url}[/yellow]")
        return await _basic_fetch(url)

    async with AsyncWebCrawler() as crawler:
        config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)
        result = await crawler.arun(url=url, config=config)

        if result.success:
            return CrawlResult(
                url=url,
                title=result.metadata.get("title", url),
                markdown=result.markdown.fit_markdown or result.markdown.raw_markdown,
                links=[lnk["href"] for lnk in (result.links.get("internal", []) + result.links.get("external", []))],
                success=True,
            )
        else:
            return CrawlResult(url=url, title="", markdown="", links=[], success=False, error=result.error_message)


async def _basic_fetch(url: str) -> CrawlResult:
    """Minimal fallback crawler using httpx."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            # Return raw HTML as markdown (LLM will clean it)
            return CrawlResult(url=url, title=url, markdown=resp.text[:50000], links=[], success=True)
    except Exception as e:
        return CrawlResult(url=url, title="", markdown="", links=[], success=False, error=str(e))


async def crawl_urls(urls: list[str]) -> list[CrawlResult]:
    """Crawl multiple URLs concurrently."""
    tasks = [crawl_url(u) for u in urls]
    return await asyncio.gather(*tasks)