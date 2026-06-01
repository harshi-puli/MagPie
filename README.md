# MagPie 🐦‍⬛

> Turn the web into your personal knowledge base — automatically.

**Live at → [magpie-frontend-119433849716.us-central1.run.app](https://magpie-frontend-119433849716.us-central1.run.app)**

MagPie crawls any URL or GitHub repo, extracts structured knowledge, and saves it as richly linked notes directly into your Obsidian vault. Over time your vault becomes a knowledge graph — notes connected by shared concepts, people, and ideas. Export your graph at any time to prime Claude, ChatGPT, LLM Studio, or any RAG pipeline with everything you know about a topic.

---

## What it does

1. **Crawls** any URL using `crawl4ai` (handles JavaScript-rendered pages)
2. **Analyzes** content — free tier uses local NLP (spaCy + TextRank), pro tier uses Claude
3. **Extracts** key terms, main ideas, questions, entities, sentiment arc, co-occurrences, and outbound links
4. **Weaves `[[wikilinks]]`** into the content so Obsidian builds a knowledge graph automatically
5. **Saves** the note to your vault via the Obsidian Local REST API
6. **Visualizes** your knowledge as an interactive D3 force graph — click any node to expand it
7. **Exports** your graph as Markdown or JSON for use in any LLM workflow

---

## Three tiers

### 🌿 Free — local NLP
No API key needed. Runs entirely on your machine.

**Surface mode** (fast): title, summary, 6 key terms, 2 main ideas, 4 entities, wikilinks

**Deep dive mode** (full pipeline):
- TextRank summarization
- TF-IDF keyword extraction
- Term co-occurrence graph
- spaCy Named Entity Recognition
- Flesch-Kincaid readability stats
- Sentiment arc across 4 sections
- Key question extraction
- Relevant outbound link scoring

### ✨ Claude — pro tier
Bring your own Anthropic API key. Claude-quality analysis with the same rich field structure as deep dive, but smarter:
- Better summaries and more accurate wikilinks
- Substantive questions (not just `?`-sentences)
- Richer co-occurrence reasoning
- Full sentiment arc with scored sections

### 🐙 GitHub project analysis
Drop any public GitHub URL. Always free, Claude-optional.

**Free**: tech stack, key concepts, features, contributors, commit sparkline, file structure

**With Claude**: adds architecture notes, tradeoffs, use cases, related technologies, and open questions — each rendered as its own cluster in the graph

---

## The knowledge graph

Every crawled article or project becomes a node. Clusters radiate out from each root node:

| Cluster | Free | Claude |
|---|---|---|
| Key Terms + co-occurrence edges | ✓ deep dive | ✓ |
| Main Ideas | ✓ deep dive | ✓ |
| Questions | ✓ deep dive | ✓ |
| Entities | ✓ deep dive | ✓ |
| Sentiment Arc | ✓ deep dive | ✓ |
| Related Links | ✓ deep dive | ✓ |
| Tech Stack (projects) | ✓ | ✓ |
| Architecture Notes (projects) | — | ✓ |
| Tradeoffs (projects) | — | ✓ |
| Use Cases (projects) | — | ✓ |
| Related Technologies (projects) | — | ✓ |

**Graph interactions**: scroll to zoom, drag nodes, click any node to open a detail panel showing the full untruncated text and all connected neighbors. Clicking the background resets the view.

Shared concept nodes connect articles automatically — crawl enough articles on a topic and the graph clusters them without any manual work.

---

## Export for LLM workflows

Export your knowledge graph (filtered or in full) as:

**Markdown** — works with Claude Projects, ChatGPT custom instructions, LLM Studio context documents, Obsidian. Includes a cross-source term frequency summary at the top, making it ideal for priming an LLM before starting work on a topic.

**JSON** — structured for RAG pipelines (LangChain, LlamaIndex, LM Studio API mode). Includes a `global_context` block with deduplicated entities and term frequencies across all sources.

Both formats export from the Crawls view — export the current filtered view or all crawls at once. Individual items can also be exported from the History view.

---

## Project structure

```
MagPie/
├── api/
│   └── backend.py             # FastAPI backend (uvicorn api.backend:app)
├── frontend-react/
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx    # Marketing page
│       │   ├── Dashboard.jsx  # Main app — graph, history, crawls, settings
│       │   ├── Onboarding.jsx # First-run setup
│       │   └── AuthCallback.jsx
│       ├── components/
│       │   ├── GraphView.jsx  # D3 force graph with click-to-expand panel
│       │   ├── CrawlGallery.jsx # Card grid with filtering, tag cloud, export
│       │   └── ResultCard.jsx
│       └── lib/
│           ├── supabase.js    # Auth + crawl history persistence
│           └── api.js         # Backend API client
├── crawler.py                 # crawl4ai web crawler
├── llm_processor.py           # Claude article + GitHub analysis
├── nlp_processor.py           # Free local NLP pipeline
├── obsidian_client.py         # Obsidian Local REST API client
├── config.yaml                # Personal config (gitignored)
└── requirements.txt
```

---

## Self-hosting

### Prerequisites
- Python 3.10+
- Node.js 18+
- Obsidian desktop with the **Local REST API** community plugin enabled
- A Supabase project (free tier is fine)

### 1. Clone and install

```bash
git clone https://github.com/you/magpie.git
cd magpie
pip install -r requirements.txt
crawl4ai-setup   # installs Playwright browsers
cd frontend-react && npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=sk-ant-...      # optional — enables Claude tier
OBSIDIAN_API_KEY=your-key         # from Obsidian → Settings → Local REST API
GITHUB_TOKEN=ghp_...              # optional — raises GitHub rate limit to 5000/hr
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:8000
```

### 3. Supabase schema

Run this in your Supabase SQL editor:

```sql
create table profiles (
  id uuid primary key references auth.users,
  obsidian_key text,
  default_mode text default 'surface',
  updated_at timestamptz default now()
);

create table crawls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text, url text, title text, summary text,
  tags jsonb, links jsonb, key_terms jsonb, main_ideas jsonb,
  questions jsonb, sentiment_arc jsonb, stats jsonb,
  related_links jsonb, co_occurrences jsonb, entities jsonb,
  mode text, tier text, vault_path text,
  crawled_at timestamptz default now()
);

alter table profiles enable row level security;
alter table crawls enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own crawls"  on crawls  for all using (auth.uid() = user_id);
```

### 4. Run locally

```bash
# Backend
python -m uvicorn api.backend:app --reload --port 8000

# Frontend
cd frontend-react && npm run dev
```

---

## Deploying to Google Cloud Run

Both the frontend and backend are containerized and deployed to Cloud Run.

```bash
# Build and deploy backend
gcloud run deploy magpie-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ANTHROPIC_API_KEY=...,OBSIDIAN_API_KEY=...

# Build and deploy frontend
cd frontend-react
gcloud run deploy magpie-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

Set `VITE_API_URL` to your backend Cloud Run URL before building the frontend.

---

## Cost

**Free tier**: $0 — runs entirely locally with spaCy + TextRank.

**Claude tier**: uses Claude Haiku by default — the cheapest Anthropic model.

| | Cost |
|---|---|
| Per article (Claude) | ~$0.0003–0.001 |
| 100 articles | ~$0.05–0.10 |
| Per GitHub repo (Claude) | ~$0.001–0.003 |

Set a hard spend limit at **console.anthropic.com → Settings → Limits**.

**Google Cloud Run**: scales to zero when not in use. Typical cost for a personal deployment is $0–2/month.

---

## Tech stack

| Layer | Technology |
|---|---|
| Web crawling | crawl4ai + Playwright |
| Free NLP | spaCy, TextRank, TF-IDF, VADER sentiment |
| LLM | Anthropic Claude Haiku |
| Backend API | FastAPI + uvicorn |
| Frontend | React + Vite |
| Graph visualization | D3 force simulation |
| Auth + persistence | Supabase |
| Vault integration | Obsidian Local REST API |
| Deployment | Google Cloud Run |

---

## License

MIT