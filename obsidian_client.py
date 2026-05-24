"""
Client for the Obsidian Local REST API plugin.
Install: https://github.com/coddingtonbear/obsidian-local-rest-api

Supports two note modes:
  surface   — title, summary, tags, wikilinks (clean and fast)
  deep_dive — + key terms, main ideas, questions, sentiment arc, stats, related links
"""

import httpx
import re
from dataclasses import dataclass, field
from typing import Optional, Literal


@dataclass
class Note:
    title: str
    content: str
    folder: str = "Web Clippings"
    tags: list[str] = None
    links: list[str] = None         # [[wikilink]] concept names
    source_url: str = ""
    summary: str = ""
    mode: str = "surface"           # "surface" | "deep_dive"

    # Deep dive extras
    key_terms: list[str] = None
    main_ideas: list[str] = None
    questions: list[str] = None
    sentiment_arc: list[dict] = None
    stats: dict = None
    related_links: list[dict] = None
    entities: list[str] = None


class ObsidianClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "text/markdown",
        }

    def _safe_filename(self, title: str) -> str:
        safe = re.sub(r'[\\/*?:"<>|]', "", title)
        safe = safe.strip().replace(" ", "-")
        return safe[:100]

    def _build_surface_note(self, note: Note) -> str:
        """Clean, minimal note — title, summary, tags, wikilinks."""
        tags_yaml = "\n".join(f"  - {t}" for t in (note.tags or []))
        links_yaml = "\n".join(f"  - {lnk}" for lnk in (note.links or []))

        frontmatter = f"""---
source: "{note.source_url}"
summary: "{note.summary.replace('"', "'")}"
mode: surface
tags:
{tags_yaml}
linked_concepts:
{links_yaml}
---

"""
        related = ""
        if note.links:
            linked = "  ".join(f"[[{lnk}]]" for lnk in note.links)
            related = f"\n\n---\n## Related Concepts\n{linked}\n"

        return frontmatter + note.content + related

    def _build_deep_dive_note(self, note: Note) -> str:
        """Rich note with all NLP analysis sections."""
        tags_yaml = "\n".join(f"  - {t}" for t in (note.tags or []))
        links_yaml = "\n".join(f"  - {lnk}" for lnk in (note.links or []))

        frontmatter = f"""---
source: "{note.source_url}"
summary: "{note.summary.replace('"', "'")}"
mode: deep_dive
tags:
{tags_yaml}
linked_concepts:
{links_yaml}
---

"""
        sections = [frontmatter, note.content]

        # ── Key Terms ────────────────────────────────────────────────────────
        if note.key_terms:
            terms = " · ".join(f"`{t}`" for t in note.key_terms)
            sections.append(f"\n\n---\n## 🔑 Key Terms\n{terms}")

        # ── Main Ideas ───────────────────────────────────────────────────────
        if note.main_ideas:
            ideas = "\n".join(f"> {idea}" for idea in note.main_ideas)
            sections.append(f"\n\n## 💡 Main Ideas\n{ideas}")

        # ── Key Questions ────────────────────────────────────────────────────
        if note.questions:
            qs = "\n".join(f"- {q}" for q in note.questions)
            sections.append(f"\n\n## ❓ Key Questions\n{qs}")

        # ── Sentiment Arc ────────────────────────────────────────────────────
        if note.sentiment_arc:
            arc_lines = " → ".join(
                f"{s.get('section','')}: {s.get('emoji','')} {s.get('label','')}"
                for s in note.sentiment_arc
            )
            sections.append(f"\n\n## 🌡 Sentiment Arc\n{arc_lines}")

        # ── Article Stats ────────────────────────────────────────────────────
        if note.stats:
            s = note.stats
            sections.append(
                f"\n\n## 📊 Article Stats\n"
                f"- **Reading level:** {s.get('reading_level','?')}\n"
                f"- **Read time:** ~{s.get('estimated_read_minutes','?')} min\n"
                f"- **Word count:** {s.get('word_count','?')}\n"
                f"- **Vocabulary richness:** {s.get('vocabulary_richness','?')}\n"
                f"- **Avg sentence length:** {s.get('avg_sentence_length','?')} words"
            )

        # ── Entities ─────────────────────────────────────────────────────────
        if note.entities:
            ents = " · ".join(f"[[{e}]]" for e in note.entities)
            sections.append(f"\n\n## 🏷 Entities\n{ents}")

        # ── Related Links ────────────────────────────────────────────────────
        if note.related_links:
            links_md = "\n".join(
                f"- [{lnk.get('label','Link')}]({lnk.get('url','')}) *(relevance: {lnk.get('score',0)})*"
                for lnk in note.related_links
            )
            sections.append(f"\n\n## 🔗 Related Links\n{links_md}")

        # ── Related Concepts (wikilinks) ──────────────────────────────────────
        if note.links:
            linked = "  ".join(f"[[{lnk}]]" for lnk in note.links)
            sections.append(f"\n\n---\n## Related Concepts\n{linked}\n")

        return "".join(sections)

    def _build_note_body(self, note: Note) -> str:
        if note.mode == "deep_dive":
            return self._build_deep_dive_note(note)
        return self._build_surface_note(note)

    def create_note(self, note: Note) -> dict:
        filename = self._safe_filename(note.title)
        path = f"{note.folder}/{filename}.md"
        body = self._build_note_body(note)
        url = f"{self.base_url}/vault/{path}"
        response = httpx.put(url, content=body.encode(), headers=self.headers, verify=False)
        response.raise_for_status()
        return {"path": path, "status": response.status_code}

    def note_exists(self, title: str, folder: str) -> bool:
        filename = self._safe_filename(title)
        path = f"{folder}/{filename}.md"
        url = f"{self.base_url}/vault/{path}"
        response = httpx.get(url, headers=self.headers, verify=False)
        return response.status_code == 200

    def list_notes(self, folder: str = "") -> list[str]:
        url = f"{self.base_url}/vault/{folder}/"
        response = httpx.get(url, headers=self.headers, verify=False)
        response.raise_for_status()
        return response.json().get("files", [])