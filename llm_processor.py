"""
MagPie — Claude LLM Processor (Pro Tier)

Replaces the free NLP pipeline with Claude for richer, smarter analysis.
Returns the same field shape as nlp_processor.NLPResult so the backend
can treat both interchangeably.

Article mode produces:
  title, summary, tags, links (wikilinks), content (with [[wikilinks]])
  key_terms, main_ideas, questions, entities
  sentiment_arc, co_occurrences, related_links, stats (partial)

GitHub mode produces:
  summary, key_concepts, features, architecture_notes,
  tradeoffs, use_cases, related_technologies, questions
"""

import json
import os
import re
import anthropic
from dataclasses import dataclass, field
from typing import Optional
from rich.console import Console

console = Console()


# ── Result dataclasses ────────────────────────────────────────────────────────

@dataclass
class ProcessedContent:
    """Rich structured result — same shape as nlp_processor.NLPResult."""
    title: str
    summary: str
    tags: list[str]
    links: list[str]          # wikilink concept names
    content: str              # cleaned content with [[wikilinks]] injected
    key_terms: list[str]
    main_ideas: list[str]
    questions: list[str]
    entities: list[str]
    sentiment_arc: list[dict] # [{section, label, score, emoji}]
    co_occurrences: list[dict]# [{term_a, term_b, strength}]
    related_links: list[dict] # [{label, url, score}]
    stats: dict               # partial — word_count etc from raw text
    success: bool
    error: Optional[str] = None


@dataclass
class ProcessedProject:
    """Claude-enriched GitHub analysis on top of the free fetch_repo data."""
    summary: str                      # better than repo.description
    key_concepts: list[str]           # smarter than extract_key_concepts
    features: list[str]               # better than README bullet extraction
    architecture_notes: list[str]     # NEW: how it's built
    tradeoffs: list[str]              # NEW: pros/cons, known limitations
    use_cases: list[str]              # NEW: what it's actually for
    related_technologies: list[str]   # NEW: alternatives, complements
    questions: list[str]              # NEW: open questions about the project
    tags: list[str]
    success: bool
    error: Optional[str] = None


# ── Prompts ───────────────────────────────────────────────────────────────────

ARTICLE_SYSTEM_PROMPT = """You are MagPie, a knowledge extraction engine. Analyze the article and return a single JSON object — no markdown fences, no preamble, just raw JSON.

The JSON must have exactly these keys:

{
  "title": "Clean article title",
  "summary": "3-4 sentence summary capturing the core argument and why it matters",
  "tags": ["tag1", "tag2", ...],  // 5-8 lowercase hyphenated tags
  "key_terms": ["term1", ...],    // 8-12 important domain terms or concepts
  "main_ideas": [                 // 3-5 core ideas as full sentences
    "The article argues that ...",
    "A key finding is ...",
    ...
  ],
  "questions": [                  // 3-5 substantive questions this raises
    "How does X relate to Y?",
    ...
  ],
  "entities": ["Person", "Org", "Product", ...],  // named entities, 5-10
  "wikilinks": ["Concept A", "Concept B", ...],   // 8-15 concepts for [[wikilinks]]
  "sentiment_arc": [              // emotional/rhetorical tone across 4 sections
    {"section": "Opening",  "label": "Neutral",           "score": 0.1,  "emoji": "😶"},
    {"section": "Early",    "label": "Slightly Positive", "score": 0.4,  "emoji": "🙂"},
    {"section": "Middle",   "label": "Positive",          "score": 1.2,  "emoji": "😊"},
    {"section": "Closing",  "label": "Slightly Negative", "score": -0.3, "emoji": "😐"}
  ],
  "co_occurrences": [            // top 6 pairs of key_terms that are conceptually linked
    {"term_a": "transformers", "term_b": "attention", "strength": 0.9},
    ...
  ],
  "related_links": [             // up to 3 outbound links worth following
    {"label": "Link text", "url": "https://...", "score": 2},
    ...
  ],
  "content": "The cleaned article content in markdown. Inject [[wikilinks]] naturally around key concepts the first time they appear. Keep all meaningful content. Remove nav, ads, footers."
}

Rules:
- main_ideas must be complete sentences, not fragments
- questions must be substantive, not rhetorical nav questions
- co_occurrences strength is 0.0–1.0; only include pairs with strength >= 0.3
- sentiment labels: "Positive" | "Slightly Positive" | "Neutral" | "Slightly Negative" | "Negative"
- wikilinks should be title-cased concept names (e.g. "Attention Mechanism", "Transformer Architecture")
- Do NOT include any text outside the JSON object"""

GITHUB_SYSTEM_PROMPT = """You are MagPie, a software project analyst. You will receive metadata about a GitHub repository including its README, tech stack, and file structure. Return a single JSON object — no markdown fences, no preamble, just raw JSON.

{
  "summary": "2-3 sentence summary of what this project does and who it's for. Better than the repo description.",
  "key_concepts": ["Concept A", ...],    // 8-15 title-cased concepts this project embodies
  "features": ["Feature description", ...], // 5-8 actual features, more specific than README bullets
  "architecture_notes": [               // 3-5 notes on HOW it's built (patterns, decisions)
    "Uses a plugin architecture allowing...",
    "Separates concerns between X and Y via...",
    ...
  ],
  "tradeoffs": [                        // 3-5 honest pros/cons or limitations
    "Requires local Obsidian install which limits...",
    "The free NLP tier is fast but less accurate than...",
    ...
  ],
  "use_cases": [                        // 3-5 concrete use cases
    "Researchers who want to build a reading list...",
    ...
  ],
  "related_technologies": ["Alt A", "Alt B", ...], // 5-8 alternatives or complements
  "questions": [                        // 3-5 open questions about the project
    "How does it handle rate limiting for the GitHub API?",
    ...
  ],
  "tags": ["tag1", ...]                 // 5-8 lowercase tags
}

Rules:
- architecture_notes should reference specific files/patterns you can see in the structure
- tradeoffs should be honest, not marketing language
- related_technologies should include both alternatives AND complementary tools
- Do NOT include any text outside the JSON object"""


# ── Client helper ─────────────────────────────────────────────────────────────

def _make_client(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key)


def _call_claude(client: anthropic.Anthropic, system: str, user: str, max_tokens: int = 4096) -> str:
    msg = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


def _parse_json(raw: str) -> dict:
    """Strip accidental fences and parse JSON."""
    clean = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.MULTILINE)
    clean = re.sub(r'\s*```$', '', clean.strip(), flags=re.MULTILINE)
    return json.loads(clean.strip())


def _basic_stats(text: str) -> dict:
    """Word count + rough read time from raw text."""
    words = re.findall(r'\b[a-zA-Z]+\b', text)
    wc = len(words)
    return {
        "word_count": wc,
        "estimated_read_minutes": max(1, round(wc / 200)),
    }


# ── Article processor ─────────────────────────────────────────────────────────

def process_content(
    raw_markdown: str,
    source_url: str,
    api_key: str,
    model: str = "claude-haiku-4-5",
) -> ProcessedContent:
    """
    Full Claude analysis of a crawled article.
    Returns rich structured data matching the free NLP pipeline's field shape.
    """
    client = _make_client(api_key)
    user_msg = f"URL: {source_url}\n\n---\n\n{raw_markdown[:40000]}"

    try:
        raw = _call_claude(client, ARTICLE_SYSTEM_PROMPT, user_msg, max_tokens=4096)
        data = _parse_json(raw)
    except json.JSONDecodeError as e:
        console.print(f"[red]JSON parse error: {e}[/red]")
        console.print(f"Raw response: {raw[:500]}")
        return ProcessedContent(
            title="", summary="", tags=[], links=[], content="",
            key_terms=[], main_ideas=[], questions=[], entities=[],
            sentiment_arc=[], co_occurrences=[], related_links=[], stats={},
            success=False, error=f"JSON parse error: {e}",
        )
    except Exception as e:
        return ProcessedContent(
            title="", summary="", tags=[], links=[], content="",
            key_terms=[], main_ideas=[], questions=[], entities=[],
            sentiment_arc=[], co_occurrences=[], related_links=[], stats={},
            success=False, error=str(e),
        )

    # Extract wikilinks both from explicit field and any [[...]] in content
    wikilinks = data.get("wikilinks", [])
    content = data.get("content", "")
    inline = list(set(re.findall(r'\[\[([^\]]+)\]\]', content)))
    all_links = list(dict.fromkeys(wikilinks + inline))[:15]

    return ProcessedContent(
        title=data.get("title") or "Untitled",
        summary=data.get("summary", ""),
        tags=data.get("tags", [])[:8],
        links=all_links,
        content=content,
        key_terms=data.get("key_terms", [])[:12],
        main_ideas=data.get("main_ideas", [])[:5],
        questions=data.get("questions", [])[:5],
        entities=data.get("entities", [])[:10],
        sentiment_arc=data.get("sentiment_arc", []),
        co_occurrences=data.get("co_occurrences", [])[:8],
        related_links=data.get("related_links", [])[:3],
        stats=_basic_stats(raw_markdown),
        success=True,
    )


# ── GitHub / project processor ────────────────────────────────────────────────

def process_project(
    repo_data: dict,
    api_key: str,
) -> ProcessedProject:
    """
    Claude-powered analysis of a GitHub repo.
    repo_data should be the dict already built by the free analyzer so we
    don't re-fetch anything — we just add intelligence on top.
    """
    client = _make_client(api_key)

    # Build a compact but rich context for Claude
    tech = repo_data.get("tech_stack") or repo_data.get("languages") or []
    contributors = [c.get("login", c) if isinstance(c, dict) else c for c in (repo_data.get("contributors") or [])]
    file_structure = repo_data.get("file_structure") or []
    file_list = ", ".join(f"{f.get('emoji','')} {f.get('name','')}" for f in file_structure[:20])

    user_msg = f"""Repository: {repo_data.get('title', '')}
URL: {repo_data.get('url', '')}
Description: {repo_data.get('description', '')}
Stars: {repo_data.get('stars', 0):,} · Forks: {repo_data.get('forks', 0):,}
Primary language: {repo_data.get('primary_language', 'unknown')}
Activity: {repo_data.get('activity', 'unknown')} (sparkline: {repo_data.get('sparkline', '')})

Tech stack: {', '.join(tech[:20])}
Topics: {', '.join(repo_data.get('topics') or [])}
Contributors: {', '.join(contributors[:8])}
File structure: {file_list}

Existing features extracted from README:
{chr(10).join(f'- {f}' for f in (repo_data.get('features') or [])[:8])}

README (first 6000 chars):
{repo_data.get('readme_preview', '')[:6000]}
"""

    try:
        raw = _call_claude(client, GITHUB_SYSTEM_PROMPT, user_msg, max_tokens=3000)
        data = _parse_json(raw)
    except json.JSONDecodeError as e:
        console.print(f"[red]JSON parse error (project): {e}[/red]")
        return ProcessedProject(
            summary="", key_concepts=[], features=[], architecture_notes=[],
            tradeoffs=[], use_cases=[], related_technologies=[], questions=[], tags=[],
            success=False, error=f"JSON parse error: {e}",
        )
    except Exception as e:
        return ProcessedProject(
            summary="", key_concepts=[], features=[], architecture_notes=[],
            tradeoffs=[], use_cases=[], related_technologies=[], questions=[], tags=[],
            success=False, error=str(e),
        )

    return ProcessedProject(
        summary=data.get("summary", ""),
        key_concepts=data.get("key_concepts", [])[:15],
        features=data.get("features", [])[:8],
        architecture_notes=data.get("architecture_notes", [])[:5],
        tradeoffs=data.get("tradeoffs", [])[:5],
        use_cases=data.get("use_cases", [])[:5],
        related_technologies=data.get("related_technologies", [])[:8],
        questions=data.get("questions", [])[:5],
        tags=data.get("tags", [])[:8],
        success=True,
    )