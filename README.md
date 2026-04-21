# MagPie 🐦‍⬛ : Obsidian Crawler

> Turn the web into your personal knowledge base — automatically.

MagPie crawls any URL, summarizes it with Claude, and saves it as a beautifully linked note directly into your Obsidian vault. Over time your vault becomes a knowledge graph — notes connected by shared concepts, people, and ideas.

---

## What it does

1. **Crawls** any URL using `crawl4ai` (handles JavaScript-rendered pages)
2. **Summarizes** the content with Claude (Haiku — fast and cheap)
3. **Auto-tags** the note with relevant keywords
4. **Weaves `[[wikilinks]]`** into the content so Obsidian builds a knowledge graph automatically
5. **Saves** the note to your vault via the Obsidian Local REST API

---

## Three ways to use it

```
FastAPI Backend (api/server.py)
        │
        ├── Web UI (frontend/index.html)
        │     Paste a URL in the browser, see results instantly
        │
        ├── Obsidian Plugin (obsidian-plugin/)
        │     Right-click any URL → "Save to vault with MagPie"
        │     Ribbon icon + Command palette support
        │
        └── CLI (main.py)
              python main.py https://example.com
```

---

## Project Structure

```
MagPie/
├── api/
│   ├── __init__.py
│   └── server.py              # FastAPI backend
├── frontend/
│   └── index.html             # Web UI (no build needed)
├── obsidian-plugin/
│   ├── src/
│   │   └── main.ts            # Plugin source (TypeScript)
│   ├── dist/
│   │   └── main.js            # Built plugin (generated)
│   ├── manifest.json
│   ├── package.json
│   └── esbuild.config.mjs
├── crawler.py                 # Web crawling via crawl4ai
├── llm_processor.py           # Claude summarization + wikilinks
├── obsidian_client.py         # Obsidian REST API client
├── main.py                    # CLI + --check health command
├── config.yaml                # Your personal config (gitignored)
├── config.example.yaml        # Template for new users
├── .env                       # Your API keys (gitignored)
├── .env.example               # Template for new users
├── .gitignore
└── requirements.txt
```

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js (for the Obsidian plugin)
- Obsidian desktop app with the **Local REST API** community plugin enabled

### 1. Clone & install Python deps
```bash
git clone https://github.com/you/magpie.git
cd magpie
pip install -r requirements.txt
crawl4ai-setup   # installs Playwright browsers for JS rendering
```

### 2. Set up your API keys
```bash
cp .env.example .env
```
Edit `.env` and fill in:
```
ANTHROPIC_API_KEY=sk-ant-...
OBSIDIAN_API_KEY=your-obsidian-key
```
Get your Obsidian API key from: Obsidian → Settings → Local REST API → copy key.

### 3. Configure your vault
```bash
cp config.example.yaml config.yaml
```
Edit `config.yaml` and set your vault folder and URLs.

### 4. Verify everything is connected
```bash
python main.py --check
```
All four checks should show green before you proceed.

---

## Running MagPie

### Start the backend
```bash
python -m uvicorn api.server:app --reload --port 8000
```

### Open the Web UI
```bash
open frontend/index.html
# or drag index.html into your browser
```

### Use the CLI
```bash
python main.py https://example.com/article
python main.py --check
```

---

## Installing the Obsidian Plugin

```bash
cd obsidian-plugin
npm install
npm run build

# Copy into your vault (adjust path to match your vault location)
mkdir -p ~/Documents/Obsidian\ Vault/.obsidian/plugins/magpie-crawler
cp dist/main.js ~/Documents/Obsidian\ Vault/.obsidian/plugins/magpie-crawler/
cp manifest.json ~/Documents/Obsidian\ Vault/.obsidian/plugins/magpie-crawler/
echo '{}' > ~/Documents/Obsidian\ Vault/.obsidian/plugins/magpie-crawler/data.json
touch ~/Documents/Obsidian\ Vault/.obsidian/plugins/magpie-crawler/styles.css
```

Then in Obsidian: **Cmd+Q** to quit, reopen, Settings → Community Plugins → enable **MagPie**.

### Plugin features
- 🐦‍⬛ **Ribbon icon** — click to open the crawl dialog
- **Right-click menu** — select any URL in a note → "Save to vault with MagPie"
- **Command palette** — `Cmd+P` → "Crawl a URL into vault"
- **Settings** — configure the API URL and default vault folder

---

## How notes look in Obsidian

Each saved note includes YAML frontmatter with source URL, summary, tags, and linked concepts, plus cleaned article content with wikilinks woven in naturally.

```markdown
---
source: "https://example.com/article"
summary: "A brief summary of the article."
tags:
  - machine-learning
  - transformers
linked_concepts:
  - Attention Mechanism
  - BERT
  - Neural Networks
---

The article explores how [[Attention Mechanism]] changed [[Natural Language Processing]]...

---
## Related Concepts
[[Attention Mechanism]]  [[BERT]]  [[Neural Networks]]
```

After crawling many articles, open **Obsidian Graph View** to see your knowledge web.

---

## Cost

MagPie uses Claude Haiku by default — the cheapest Anthropic model.

| | Cost |
|---|---|
| Per article | ~$0.0003 |
| 100 articles | ~$0.03 |
| 1,000 articles | ~$0.30 |

Set a hard spend limit at **console.anthropic.com → Settings → Limits** for peace of mind.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web crawling | crawl4ai + Playwright |
| LLM | Anthropic Claude Haiku |
| Embeddings | sentence-transformers (local, free) |
| Vector DB | ChromaDB |
| Backend API | FastAPI + uvicorn |
| Web UI | Vanilla HTML/CSS/JS |
| Obsidian plugin | TypeScript + esbuild |
| Vault integration | Obsidian Local REST API |

---

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key — console.anthropic.com |
| `OBSIDIAN_API_KEY` | From Obsidian → Settings → Local REST API |

Never commit `.env` — it's already in `.gitignore`.

---

## License

MIT