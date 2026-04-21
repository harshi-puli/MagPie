"""
Client for the Obsidian Local REST API plugin.
Install the plugin: https://github.com/coddingtonbear/obsidian-local-rest-api
"""

import httpx
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Note:
    title: str
    content: str
    folder: str = "Web Clippings"
    tags: list[str] = None
    links: list[str] = None   # [[wikilink]] concept names
    source_url: str = ""
    summary: str = ""


class ObsidianClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "text/markdown",
        }

    def _safe_filename(self, title: str) -> str:
        """Convert a title to a safe Obsidian filename."""
        safe = re.sub(r'[\\/*?:"<>|]', "", title)
        safe = safe.strip().replace(" ", "-")
        return safe[:100]

    def _build_note_body(self, note: Note) -> str:
        """Build a markdown note with YAML frontmatter and a linked concepts section."""
        tags_yaml = "\n".join(f"  - {t}" for t in (note.tags or []))
        links_yaml = "\n".join(f"  - {lnk}" for lnk in (note.links or []))

        frontmatter = f"""---
source: "{note.source_url}"
summary: "{note.summary.replace('"', "'")}"
tags:
{tags_yaml}
linked_concepts:
{links_yaml}
---

"""
        # Append a "Related Concepts" section at the bottom so the graph lights up
        related = ""
        if note.links:
            linked = "  ".join(f"[[{lnk}]]" for lnk in note.links)
            related = f"\n\n---\n## Related Concepts\n{linked}\n"

        return frontmatter + note.content + related

    def create_note(self, note: Note) -> dict:
        """Create or overwrite a note in the vault."""
        filename = self._safe_filename(note.title)
        path = f"{note.folder}/{filename}.md"
        body = self._build_note_body(note)

        url = f"{self.base_url}/vault/{path}"
        response = httpx.put(url, content=body.encode(), headers=self.headers, verify=False)
        response.raise_for_status()
        return {"path": path, "status": response.status_code}

    def note_exists(self, title: str, folder: str) -> bool:
        """Check if a note already exists."""
        filename = self._safe_filename(title)
        path = f"{folder}/{filename}.md"
        url = f"{self.base_url}/vault/{path}"
        response = httpx.get(url, headers=self.headers, verify=False)
        return response.status_code == 200

    def list_notes(self, folder: str = "") -> list[str]:
        """List all notes in a vault folder."""
        url = f"{self.base_url}/vault/{folder}/"
        response = httpx.get(url, headers=self.headers, verify=False)
        response.raise_for_status()
        return response.json().get("files", [])