"""
MagPie — GitHub API client
Fetches repo metadata, README, tech stack, file structure, contributors, commit activity.
No API key required for public repos (60 req/hr unauthenticated,
5000/hr with GITHUB_TOKEN set in .env).
"""

import os
import base64
import httpx
import json
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RepoData:
    # Core metadata
    owner: str
    name: str
    full_name: str
    description: str
    url: str
    stars: int
    forks: int
    watchers: int
    open_issues: int
    license: Optional[str]
    created_at: str
    updated_at: str
    default_branch: str

    # Content
    readme: str
    topics: list[str]
    languages: dict[str, int]
    primary_language: Optional[str]

    # People
    contributors: list[dict]

    # Activity
    commit_activity: list[int]

    # File structure — top level only
    file_structure: list[dict]   # [{name, type: "file"|"dir", emoji}]

    # Derived
    tech_stack: list[str] = field(default_factory=list)
    key_concepts: list[str] = field(default_factory=list)
    features: list[str] = field(default_factory=list)  # extracted from README


GITHUB_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# Common file/folder emoji map
ENTRY_EMOJI = {
    # dirs
    "src": "📂", "lib": "📂", "tests": "🧪", "test": "🧪",
    "docs": "📖", "doc": "📖", "examples": "💡", "example": "💡",
    "scripts": "⚙️", "utils": "🔧", "api": "🔌", "frontend": "🎨",
    "backend": "⚙️", "models": "🧠", "data": "🗂️", "config": "⚙️",
    "public": "🌐", "assets": "🖼️", "dist": "📦", "build": "🏗️",
    # files
    "readme.md": "📋", "requirements.txt": "📋", "package.json": "📦",
    "dockerfile": "🐳", "docker-compose.yml": "🐳", "makefile": "🔨",
    ".github": "🐙", "license": "📄", "contributing.md": "🤝",
    "pyproject.toml": "📋", "setup.py": "⚙️", "go.mod": "📋",
    "cargo.toml": "📋",
}


def _auth_headers() -> dict:
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = dict(GITHUB_HEADERS)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def parse_github_url(url: str) -> tuple[str, str]:
    url = url.rstrip("/").replace("https://github.com/", "").replace("http://github.com/", "")
    parts = url.split("/")
    if len(parts) < 2:
        raise ValueError(f"Invalid GitHub URL: {url}")
    return parts[0], parts[1]


def _get_file_emoji(name: str, entry_type: str) -> str:
    key = name.lower()
    if key in ENTRY_EMOJI:
        return ENTRY_EMOJI[key]
    if entry_type == "dir":
        return "📁"
    # Guess by extension
    ext = key.rsplit(".", 1)[-1] if "." in key else ""
    ext_map = {
        "py": "🐍", "js": "🟨", "ts": "🔷", "jsx": "⚛️", "tsx": "⚛️",
        "md": "📝", "txt": "📄", "json": "📋", "yaml": "📋", "yml": "📋",
        "sh": "⚙️", "toml": "📋", "lock": "🔒", "env": "🔑",
        "html": "🌐", "css": "🎨", "rs": "🦀", "go": "🐹",
    }
    return ext_map.get(ext, "📄")


def fetch_file_structure(client: httpx.Client, owner: str, repo: str, branch: str) -> list[dict]:
    """Fetch top-level directory listing."""
    try:
        r = client.get(f"https://api.github.com/repos/{owner}/{repo}/contents/")
        if r.status_code != 200:
            return []
        entries = r.json()
        result = []
        for entry in entries:
            name = entry.get("name", "")
            etype = entry.get("type", "file")  # "file" or "dir"
            # Skip hidden files except .github
            if name.startswith(".") and name != ".github":
                continue
            result.append({
                "name": name,
                "type": etype,
                "emoji": _get_file_emoji(name, etype),
                "url": entry.get("html_url", ""),
            })
        # Sort: dirs first, then files
        result.sort(key=lambda x: (0 if x["type"] == "dir" else 1, x["name"].lower()))
        return result
    except Exception:
        return []


def extract_features_from_readme(readme: str) -> list[str]:
    """
    Extract bullet points under Features/Highlights/What's New sections.
    Returns up to 8 feature strings.
    """
    features = []
    in_features = False
    feature_headers = {"features", "highlights", "what's new", "key features",
                       "capabilities", "what it does", "overview"}

    for line in readme.splitlines():
        stripped = line.strip()
        # Detect feature section heading
        if re.match(r'^#{1,3}\s+', stripped):
            heading = re.sub(r'^#+\s+', '', stripped).lower().strip()
            in_features = heading in feature_headers
            continue
        # Stop at next heading
        if in_features and re.match(r'^#{1,3}\s+', stripped):
            in_features = False
        # Collect bullet points
        if in_features and re.match(r'^[-*•]\s+', stripped):
            text = re.sub(r'^[-*•]\s+', '', stripped)
            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # strip links
            text = re.sub(r'[`*_]', '', text).strip()
            if text and len(text) > 5:
                features.append(text[:80])  # cap length
        if len(features) >= 8:
            break

    return features


def fetch_repo(url: str) -> RepoData:
    owner, repo = parse_github_url(url)
    headers = _auth_headers()

    with httpx.Client(timeout=15, headers=headers) as client:

        # Core metadata
        r = client.get(f"https://api.github.com/repos/{owner}/{repo}")
        r.raise_for_status()
        meta = r.json()

        # README
        readme = ""
        try:
            r = client.get(f"https://api.github.com/repos/{owner}/{repo}/readme")
            if r.status_code == 200:
                content = r.json().get("content", "")
                readme = base64.b64decode(content).decode("utf-8", errors="ignore")
        except Exception:
            pass

        # Languages
        languages = {}
        try:
            r = client.get(f"https://api.github.com/repos/{owner}/{repo}/languages")
            if r.status_code == 200:
                languages = r.json()
        except Exception:
            pass

        topics = meta.get("topics", [])

        # Contributors
        contributors = []
        try:
            r = client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contributors",
                params={"per_page": 10}
            )
            if r.status_code == 200:
                contributors = [
                    {"login": c["login"], "contributions": c["contributions"], "url": c["html_url"]}
                    for c in r.json()
                ]
        except Exception:
            pass

        # Commit activity
        commit_activity = []
        try:
            r = client.get(f"https://api.github.com/repos/{owner}/{repo}/stats/participation")
            if r.status_code == 200:
                commit_activity = r.json().get("all", [])
        except Exception:
            pass

        # Tech stack
        tech_stack = _extract_tech_stack(client, owner, repo, languages)

        # File structure
        default_branch = meta.get("default_branch", "main")
        file_structure = fetch_file_structure(client, owner, repo, default_branch)

        # Features from README
        features = extract_features_from_readme(readme)

        license_name = None
        if meta.get("license"):
            license_name = meta["license"].get("spdx_id") or meta["license"].get("name")

        return RepoData(
            owner=owner,
            name=repo,
            full_name=meta["full_name"],
            description=meta.get("description") or "",
            url=meta["html_url"],
            stars=meta.get("stargazers_count", 0),
            forks=meta.get("forks_count", 0),
            watchers=meta.get("watchers_count", 0),
            open_issues=meta.get("open_issues_count", 0),
            license=license_name,
            created_at=meta.get("created_at", ""),
            updated_at=meta.get("updated_at", ""),
            default_branch=default_branch,
            readme=readme,
            topics=topics,
            languages=languages,
            primary_language=meta.get("language"),
            contributors=contributors,
            commit_activity=commit_activity,
            file_structure=file_structure,
            tech_stack=tech_stack,
            features=features,
        )


def _extract_tech_stack(client: httpx.Client, owner: str, repo: str, languages: dict) -> list[str]:
    stack = set()
    for lang in list(languages.keys())[:5]:
        stack.add(lang)

    def get_file(path: str) -> Optional[str]:
        try:
            r = client.get(f"https://api.github.com/repos/{owner}/{repo}/contents/{path}")
            if r.status_code == 200:
                content = r.json().get("content", "")
                return base64.b64decode(content).decode("utf-8", errors="ignore")
        except Exception:
            pass
        return None

    content = get_file("requirements.txt")
    if content:
        for line in content.splitlines()[:30]:
            line = line.strip()
            if line and not line.startswith("#"):
                pkg = line.split(">=")[0].split("==")[0].split("[")[0].strip()
                if pkg:
                    stack.add(pkg)

    content = get_file("package.json")
    if content:
        try:
            pkg_json = json.loads(content)
            deps = list(pkg_json.get("dependencies", {}).keys())[:15]
            dev_deps = list(pkg_json.get("devDependencies", {}).keys())[:10]
            stack.update(deps + dev_deps)
        except Exception:
            pass

    content = get_file("pyproject.toml")
    if content:
        matches = re.findall(r'^\s+"?([a-zA-Z0-9_\-]+)[>=\["\s]', content, re.MULTILINE)
        stack.update(matches[:20])

    return sorted(list(stack))[:30]


def extract_key_concepts(readme: str, topics: list[str], tech_stack: list[str]) -> list[str]:
    concepts = set()
    for topic in topics:
        concepts.add(topic.replace("-", " ").title())
    headings = re.findall(r'^#{1,3}\s+(.+)$', readme, re.MULTILINE)
    skip = {"table of contents", "contents", "toc", "installation", "usage",
            "contributing", "license", "changelog", "getting started", "quick start",
            "requirements", "dependencies", "examples", "faq", "contact", "acknowledgements",
            "features", "highlights"}
    for h in headings:
        clean = re.sub(r'[^\w\s]', '', h).strip()
        if clean.lower() not in skip and len(clean) > 2:
            concepts.add(clean.title())
    for item in tech_stack[:10]:
        if len(item) > 1:
            concepts.add(item)
    return sorted(list(concepts))[:20]