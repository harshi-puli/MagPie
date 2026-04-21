"""
Uses Claude to clean, summarize, tag, and add Obsidian wikilinks to crawled content.
"""

import os
import re
import anthropic
from dataclasses import dataclass
from typing import Optional
from rich.console import Console

console = Console()


@dataclass
class ProcessedContent:
    title: str
    summary: str
    tags: list[str]
    links: list[str]
    content: str
    success: bool
    error: Optional[str] = None


def process_content(raw_markdown: str, source_url: str, prompt_template: str, model: str = "claude-haiku-4-5") -> ProcessedContent:
    """Send raw markdown to Claude for cleaning and structuring."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    user_message = f"URL: {source_url}\n\n---\n\n{raw_markdown[:40000]}"  # stay within context

    try:
        message = client.messages.create(
            model=model,
            max_tokens=2048,
            system=prompt_template,
            messages=[{"role": "user", "content": user_message}],
        )
        response = message.content[0].text
        return _parse_llm_response(response)

    except Exception as e:
        return ProcessedContent(title="", summary="", tags=[], links=[], content="", success=False, error=str(e))


def _extract_wikilinks(text: str) -> list[str]:
    """Pull out all [[Link]] targets embedded in content."""
    return list(set(re.findall(r'\[\[([^\]]+)\]\]', text)))


def _parse_llm_response(response: str) -> ProcessedContent:
    """Parse the structured LLM response."""
    lines = response.strip().splitlines()
    title, summary, tags, links, content_lines = "", "", [], [], []
    in_content = False

    for line in lines:
        if line.startswith("TITLE:"):
            title = line.replace("TITLE:", "").strip()
        elif line.startswith("SUMMARY:"):
            summary = line.replace("SUMMARY:", "").strip()
        elif line.startswith("TAGS:"):
            raw_tags = line.replace("TAGS:", "").strip()
            tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        elif line.startswith("LINKS:"):
            raw_links = line.replace("LINKS:", "").strip()
            links = [lnk.strip() for lnk in raw_links.split(",") if lnk.strip()]
        elif line.startswith("CONTENT:"):
            in_content = True
        elif in_content:
            content_lines.append(line)

    content = "\n".join(content_lines).strip()

    # Also pick up any [[wikilinks]] Claude embedded directly in the content
    inline_links = _extract_wikilinks(content)
    all_links = list(set(links + inline_links))

    return ProcessedContent(
        title=title or "Untitled",
        summary=summary,
        tags=tags,
        links=all_links,
        content=content,
        success=True,
    )