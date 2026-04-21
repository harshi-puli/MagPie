# MagPie: Obsidian Web Crawler

Crawl web pages → summarize with Claude → save as notes in Obsidian.

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
crawl4ai-setup   # installs Playwright browsers for JS rendering
```

### 2. Configure Obsidian
- Install the **Local REST API** plugin in Obsidian
  (Settings → Community Plugins → search "Local REST API")
- Enable it and copy your API key

### 3. Set environment variables
```bash
cp .env.example .env
# Edit .env and fill in your keys:
# ANTHROPIC_API_KEY=...
# OBSIDIAN_API_KEY=...
```

### 4. Edit config.yaml
- Set `obsidian.vault_folder` to the folder you want notes saved in
- Add your URLs under the `urls` list

## Usage

```bash
# Crawl URLs from config.yaml
python main.py

# Crawl a specific URL from the command line
python main.py https://example.com/some-article
```

## Project Structure

```
obsidian-crawler/
├── main.py              # Orchestrates the pipeline
├── crawler.py           # Web crawling via crawl4ai
├── llm_processor.py     # Claude summarization & tagging
├── obsidian_client.py   # Obsidian REST API client
├── config.yaml          # URLs, settings, LLM prompt
├── .env.example         # API key template
└── requirements.txt     # Python dependencies
```

## How it works

1. **Crawl** — `crawl4ai` fetches pages and converts them to clean markdown
2. **Process** — Claude extracts title, summary, tags, and cleaned content
3. **Save** — Notes are written to your Obsidian vault via the REST API

## Customizing the LLM prompt

Edit the `llm.prompt` field in `config.yaml` to change how Claude processes content — e.g. extract action items, reformat as Q&A, translate, etc.
