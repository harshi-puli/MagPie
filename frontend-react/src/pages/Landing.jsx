import React, { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import AuthModal from '../components/AuthModal'

// ── Backend ──────────────────────────────────────────────────────────────────
// Public landing page demo always hits the free tier (no anthropic_key) and
// never saves to a real session's history.
const API = 'https://magpie-backend-119433849716.us-central1.run.app'
const DEMO_SESSION_ID = 'landing_demo'

// ── Preset graph data (shown before a real crawl happens) ─────────────────────

const EXAMPLES = {
  attention: {
    title: 'Attention mechanism',
    url: 'https://en.wikipedia.org/wiki/Attention_(machine_learning)',
    tags: ['machine-learning', 'NLP', 'transformers'],
    nodes: [
      { id: 'root',   label: 'Attention mechanism',  type: 'article'  },
      { id: 'q',      label: 'Query / Key / Value',  type: 'concept'  },
      { id: 'tr',     label: 'Transformers',         type: 'concept'  },
      { id: 'sa',     label: 'Self-attention',       type: 'concept'  },
      { id: 'mh',     label: 'Multi-head attention', type: 'concept'  },
      { id: 'pe',     label: 'Positional encoding',  type: 'concept'  },
      { id: 'bert',   label: 'BERT',                 type: 'entity'   },
      { id: 'gpt',    label: 'GPT',                  type: 'entity'   },
      { id: 'ctx',    label: 'Context window',       type: 'term'     },
      { id: 'emb',    label: 'Embeddings',           type: 'term'     },
    ],
    edges: [
      { s: 'root', t: 'q'    }, { s: 'root', t: 'tr'   }, { s: 'root', t: 'sa'   },
      { s: 'tr',   t: 'mh'   }, { s: 'tr',   t: 'pe'   }, { s: 'tr',   t: 'bert' },
      { s: 'tr',   t: 'gpt'  }, { s: 'sa',   t: 'q'    }, { s: 'sa',   t: 'ctx'  },
      { s: 'root', t: 'emb'  }, { s: 'mh',   t: 'emb'  }, { s: 'bert', t: 'mh'   },
      { s: 'gpt',  t: 'ctx'  },
    ],
  },
  rag: {
    title: 'Retrieval-Augmented Generation',
    url: 'https://arxiv.org/abs/2005.11401',
    tags: ['RAG', 'vector-search', 'LLM'],
    nodes: [
      { id: 'root',  label: 'RAG systems',        type: 'article' },
      { id: 'ret',   label: 'Retriever',           type: 'concept' },
      { id: 'gen',   label: 'Generator',           type: 'concept' },
      { id: 'vs',    label: 'Vector store',        type: 'concept' },
      { id: 'emb',   label: 'Embeddings',          type: 'term'    },
      { id: 'chunk', label: 'Chunking',            type: 'term'    },
      { id: 'pg',    label: 'pgvector',            type: 'entity'  },
      { id: 'pine',  label: 'Pinecone',            type: 'entity'  },
      { id: 'ctx',   label: 'Context injection',   type: 'concept' },
      { id: 'hal',   label: 'Hallucination',       type: 'term'    },
    ],
    edges: [
      { s: 'root', t: 'ret'  }, { s: 'root', t: 'gen'  }, { s: 'root', t: 'vs'   },
      { s: 'ret',  t: 'emb'  }, { s: 'ret',  t: 'chunk'}, { s: 'vs',   t: 'pg'   },
      { s: 'vs',   t: 'pine' }, { s: 'gen',  t: 'ctx'  }, { s: 'root', t: 'hal'  },
      { s: 'ctx',  t: 'hal'  }, { s: 'emb',  t: 'vs'   }, { s: 'ret',  t: 'ctx'  },
    ],
  },
  obsidian: {
    title: 'Obsidian PKM workflow',
    url: 'https://obsidian.md',
    tags: ['PKM', 'note-taking', 'knowledge-graph'],
    nodes: [
      { id: 'root',   label: 'Obsidian PKM',       type: 'article' },
      { id: 'wiki',   label: 'Wikilinks',           type: 'concept' },
      { id: 'graph',  label: 'Graph view',          type: 'concept' },
      { id: 'vault',  label: 'Vault',               type: 'term'    },
      { id: 'front',  label: 'Frontmatter',         type: 'term'    },
      { id: 'plugin', label: 'Community plugins',   type: 'concept' },
      { id: 'zk',     label: 'Zettelkasten',        type: 'entity'  },
      { id: 'moc',    label: 'Map of content',      type: 'concept' },
      { id: 'daily',  label: 'Daily notes',         type: 'term'    },
      { id: 'canvas', label: 'Canvas mode',         type: 'entity'  },
    ],
    edges: [
      { s: 'root',   t: 'wiki'   }, { s: 'root',  t: 'graph'  }, { s: 'root',  t: 'vault'  },
      { s: 'wiki',   t: 'graph'  }, { s: 'vault', t: 'front'  }, { s: 'root',  t: 'plugin' },
      { s: 'plugin', t: 'zk'    }, { s: 'root',  t: 'moc'    }, { s: 'moc',   t: 'wiki'   },
      { s: 'root',   t: 'daily' }, { s: 'root',  t: 'canvas' }, { s: 'graph', t: 'moc'    },
    ],
  },
  llm: {
    title: 'LLM fine-tuning',
    url: 'https://huggingface.co/docs/transformers/training',
    tags: ['fine-tuning', 'PEFT', 'LoRA'],
    nodes: [
      { id: 'root',  label: 'LLM fine-tuning',    type: 'article' },
      { id: 'lora',  label: 'LoRA',                type: 'concept' },
      { id: 'qlora', label: 'QLoRA',               type: 'concept' },
      { id: 'peft',  label: 'PEFT',                type: 'concept' },
      { id: 'sft',   label: 'Supervised FT',       type: 'term'    },
      { id: 'rlhf',  label: 'RLHF',                type: 'concept' },
      { id: 'dpo',   label: 'DPO',                 type: 'entity'  },
      { id: 'bf16',  label: 'bfloat16',            type: 'term'    },
      { id: 'hf',    label: 'Hugging Face',        type: 'entity'  },
      { id: 'data',  label: 'Instruction dataset', type: 'term'    },
    ],
    edges: [
      { s: 'root',  t: 'peft'  }, { s: 'peft', t: 'lora'  }, { s: 'lora',  t: 'qlora' },
      { s: 'root',  t: 'sft'   }, { s: 'root', t: 'rlhf'  }, { s: 'rlhf',  t: 'dpo'   },
      { s: 'sft',   t: 'data'  }, { s: 'root', t: 'hf'    }, { s: 'lora',  t: 'bf16'  },
      { s: 'peft',  t: 'hf'   }, { s: 'qlora', t: 'bf16'  }, { s: 'root',  t: 'data'  },
    ],
  },
  graph: {
    title: 'Knowledge graphs',
    url: 'https://en.wikipedia.org/wiki/Knowledge_graph',
    tags: ['knowledge-graph', 'ontology', 'RDF'],
    nodes: [
      { id: 'root',   label: 'Knowledge graphs',   type: 'article' },
      { id: 'triple', label: 'RDF triples',         type: 'concept' },
      { id: 'sparql', label: 'SPARQL',              type: 'entity'  },
      { id: 'ont',    label: 'Ontology',            type: 'concept' },
      { id: 'neo4j',  label: 'Neo4j',               type: 'entity'  },
      { id: 'embed',  label: 'Graph embeddings',    type: 'concept' },
      { id: 'kg',     label: 'Wikidata',            type: 'entity'  },
      { id: 'link',   label: 'Link prediction',     type: 'term'    },
      { id: 'ner',    label: 'Named entity recog.', type: 'term'    },
      { id: 'inf',    label: 'Inference',           type: 'concept' },
    ],
    edges: [
      { s: 'root',   t: 'triple' }, { s: 'triple', t: 'sparql' }, { s: 'root',  t: 'ont'   },
      { s: 'root',   t: 'neo4j'  }, { s: 'root',   t: 'embed'  }, { s: 'embed', t: 'link'  },
      { s: 'root',   t: 'kg'     }, { s: 'ont',    t: 'inf'    }, { s: 'triple',t: 'ont'   },
      { s: 'root',   t: 'ner'    }, { s: 'ner',    t: 'kg'     }, { s: 'embed', t: 'neo4j' },
    ],
  },
}

const NODE_COLOR = {
  article: '#1a8f7a', concept: '#c97a20', entity: '#7b5ea7', term: '#2a7a9a',
  // real-crawl types (from /crawl response, mirrors GraphView.jsx)
  entity_item: '#7b5ea7', term_item: '#2a7a9a', idea_item: '#2e7d6b',
  link_item: '#1565c0', question_item: '#b06a00',
}
const NODE_R = {
  article: 18, concept: 11, entity: 10, term: 8,
  entity_item: 10, term_item: 8, idea_item: 9, link_item: 9, question_item: 9,
}

// ── Build a small graph from one real /crawl response ──────────────────────────
// Mirrors GraphView.jsx's buildGraphData, simplified for a single live entry.
function buildLiveGraph(entry) {
  const nodes = [], edges = []
  const seen = {}
  let n = 0
  const mkId = () => `n${n++}`

  function leaf(label, type) {
    const key = `${type}::${String(label).toLowerCase()}`
    if (!seen[key]) {
      seen[key] = mkId()
      nodes.push({ id: seen[key], label: String(label), type })
    }
    return seen[key]
  }

  const rootId = mkId()
  nodes.push({ id: rootId, label: entry.title || 'Untitled', type: 'article' })

  ;(entry.key_terms || []).slice(0, 6).forEach(t => edges.push({ s: rootId, t: leaf(t, 'term_item') }))
  ;(entry.main_ideas || []).slice(0, 4).forEach(i => edges.push({ s: rootId, t: leaf(i, 'idea_item') }))
  ;(entry.entities || []).slice(0, 5).forEach(e => edges.push({ s: rootId, t: leaf(e, 'entity_item') }))
  ;(entry.links || []).slice(0, 6).forEach(l => edges.push({ s: rootId, t: leaf(l, 'link_item') }))
  ;(entry.questions || []).slice(0, 3).forEach(q => edges.push({ s: rootId, t: leaf(q, 'question_item') }))

  return {
    title: entry.title || 'Untitled',
    url: entry.url || '',
    tags: entry.tags || [],
    nodes,
    edges,
  }
}

// ── DemoGraph component ────────────────────────────────────────────────────────

function DemoGraph({ onSignIn }) {
  const [activeKey, setActiveKey] = useState('attention')
  const [liveData, setLiveData]   = useState(null) // real crawl result, once fetched
  const [inputUrl, setInputUrl]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const svgRef      = useRef(null)
  const containerRef = useRef(null)
  const simRef      = useRef(null)
  const tooltipRef  = useRef(null)

  const data = liveData || EXAMPLES[activeKey]

  useEffect(() => { renderGraph(data) }, [activeKey, liveData])

  function renderGraph(graphData) {
    if (!svgRef.current || !containerRef.current) return
    const el   = svgRef.current
    const area = containerRef.current
    const W    = area.clientWidth  || 640
    const H    = area.clientHeight || 340

    el.innerHTML = ''
    const svg = d3.select(el).attr('viewBox', `0 0 ${W} ${H}`)

    const nodes = graphData.nodes.map(n => ({ ...n }))
    const edges = graphData.edges.map(e => ({ source: e.s, target: e.t }))

    if (simRef.current) simRef.current.stop()

    const link = svg.append('g').selectAll('line').data(edges).join('line')
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')

    const node = svg.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'grab')
      .call(
        d3.drag()
          .on('start', (e, d) => { if (!e.active) simRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
          .on('end',   (e, d) => { if (!e.active) simRef.current.alphaTarget(0); d.fx = null; d.fy = null })
      )

    node.filter(d => d.type === 'article').append('circle')
      .attr('r', 24)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(26,143,122,0.2)')
      .attr('stroke-width', 1.5)

    node.append('circle')
      .attr('r', d => NODE_R[d.type] || 9)
      .attr('fill', d => NODE_COLOR[d.type] || '#666')
      .attr('stroke', d => d.type === 'article' ? 'rgba(26,143,122,.35)' : 'rgba(255,255,255,.08)')
      .attr('stroke-width', d => d.type === 'article' ? 3 : 1)
      .attr('opacity', 0.9)

    node.append('text')
      .text(d => { const m = d.type === 'article' ? 20 : 14; return d.label.length > m ? d.label.slice(0, m) + '…' : d.label })
      .attr('dy', d => (NODE_R[d.type] || 9) + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.type === 'article' ? 11 : 9)
      .attr('font-family', 'Syne, sans-serif')
      .attr('font-weight', d => d.type === 'article' ? '700' : '400')
      .attr('fill', d => d.type === 'article' ? '#c8c7d8' : '#555566')

    const tooltip = tooltipRef.current
    node
      .on('mouseover', (e, d) => {
        if (!tooltip) return
        tooltip.style.opacity = '1'
        tooltip.textContent   = d.label
      })
      .on('mousemove', e => {
        if (!tooltip || !area) return
        const rect = area.getBoundingClientRect()
        tooltip.style.left = (e.clientX - rect.left + 12) + 'px'
        tooltip.style.top  = (e.clientY - rect.top  - 10) + 'px'
      })
      .on('mouseout', () => { if (tooltip) tooltip.style.opacity = '0' })

    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(edges).id(d => d.id).distance(65))
      .force('charge',    d3.forceManyBody().strength(d => d.type === 'article' ? -300 : -100))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (NODE_R[d.type] || 9) + 16))
      .on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    simRef.current = sim
  }

  async function handleAnalyze() {
    const url = inputUrl.trim()
    if (!url) return
    setError('')

    // If it matches one of our presets exactly, just switch to it — no need to hit the backend.
    const match = Object.entries(EXAMPLES).find(([, ex]) => ex.url === url)
    if (match) { setLiveData(null); setActiveKey(match[0]); setInputUrl(''); return }

    setLoading(true)
    try {
      const res = await fetch(`${API}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          save_history: false,
          session_id: DEMO_SESSION_ID,
          // No anthropic_key — public demo always uses the free NLP tier.
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json || json.success === false) {
        const msg = json?.detail || json?.summary || 'Could not extract that page. Try a direct article URL — paywalled or nav-only pages won\'t work.'
        throw new Error(msg)
      }

      setLiveData(buildLiveGraph(json))
      setInputUrl('')
    } catch (e) {
      setError(e.message || 'Something went wrong analyzing that URL.')
    } finally {
      setLoading(false)
    }
  }

  function showPreset(key) {
    setLiveData(null)
    setError('')
    setActiveKey(key)
  }

  return (
    <div style={demoStyles.wrap}>
      {/* Header row */}
      <div style={demoStyles.header}>
        <div style={demoStyles.headerLeft}>
          <div style={demoStyles.liveDot} />
          <span style={demoStyles.liveLabel}>Live demo</span>
        </div>
        <div style={demoStyles.legend}>
          {[['article', 'Article'], ['concept', 'Concept'], ['entity', 'Entity'], ['term', 'Term']].map(([type, label]) => (
            <div key={type} style={demoStyles.legendItem}>
              <div style={{ ...demoStyles.legendDot, background: NODE_COLOR[type] }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Example pills */}
      <div style={demoStyles.pillRow}>
        <span style={demoStyles.pillLabel}>Try an example:</span>
        {Object.entries(EXAMPLES).map(([key, ex]) => (
          <button
            key={key}
            style={{ ...demoStyles.pill, ...(!liveData && activeKey === key ? demoStyles.pillActive : {}) }}
            onClick={() => showPreset(key)}
          >
            {ex.title}
          </button>
        ))}
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} style={demoStyles.canvas}>
        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        <div ref={tooltipRef} style={demoStyles.tooltip} />
        <div style={demoStyles.canvasHint}>Drag nodes · Hover to explore</div>

        {/* Tag strip */}
        <div style={demoStyles.tagStrip}>
          <span style={{ ...demoStyles.tag, ...demoStyles.tagArticle }}>
            {data.title}{liveData ? ' · live' : ''}
          </span>
          {(data.tags || []).map(t => (
            <span key={t} style={{ ...demoStyles.tag, ...demoStyles.tagTerm }}>#{t}</span>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && <div style={demoStyles.errorBox}>{error}</div>}

      {/* URL input row */}
      <div style={demoStyles.inputRow}>
        <input
          style={demoStyles.urlInput}
          type="text"
          placeholder="Paste a real article URL to analyze…"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
        />
        <button
          style={{ ...demoStyles.analyzeBtn, opacity: loading ? 0.6 : 1 }}
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? <span style={demoStyles.spinner} /> : '↗'}
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {/* CTA footer */}
      <div style={demoStyles.ctaFooter}>
        <p style={demoStyles.ctaNote}>
          Want to generate your own and save to Obsidian?
        </p>
        <button style={demoStyles.ctaBtn} onClick={onSignIn}>
          Sign in to use the full version →
        </button>
      </div>
    </div>
  )
}

const demoStyles = {
  wrap: {
    background: '#0d0d14',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  liveDot: {
    width: 7, height: 7, borderRadius: '50%',
    background: '#1a8f7a',
    boxShadow: '0 0 6px rgba(26,143,122,0.6)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  liveLabel: { fontSize: 11, fontWeight: 700, color: '#1a8f7a', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" },
  legend: { display: 'flex', gap: 14, alignItems: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#444455', fontFamily: "'DM Mono', monospace" },
  legendDot: { width: 7, height: 7, borderRadius: '50%' },

  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '12px 20px',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  pillLabel: { fontSize: 11, color: '#444455', marginRight: 2, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' },
  pill: {
    padding: '3px 10px',
    borderRadius: 100,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    fontSize: 11,
    color: '#666677',
    cursor: 'pointer',
    fontFamily: 'Syne, sans-serif',
    transition: 'all .15s',
    outline: 'none',
  },
  pillActive: {
    background: 'rgba(26,143,122,0.12)',
    border: '1px solid rgba(26,143,122,0.3)',
    color: '#1a8f7a',
  },

  canvas: {
    position: 'relative',
    height: 340,
    background: '#08080d',
  },
  tooltip: {
    position: 'absolute',
    background: 'rgba(10,10,18,0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 11,
    color: '#c8c7d8',
    pointerEvents: 'none',
    opacity: 0,
    transition: 'opacity .15s',
    whiteSpace: 'nowrap',
    zIndex: 10,
    fontFamily: "'DM Mono', monospace",
  },
  canvasHint: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontSize: 10,
    color: '#2a2a38',
    fontFamily: "'DM Mono', monospace",
  },
  tagStrip: {
    position: 'absolute',
    top: 10,
    left: 12,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  tag: {
    padding: '2px 8px',
    borderRadius: 100,
    fontSize: 10,
    fontFamily: "'DM Mono', monospace",
    fontWeight: 700,
  },
  tagArticle: {
    background: 'rgba(26,143,122,.12)',
    color: '#1a8f7a',
    border: '1px solid rgba(26,143,122,.2)',
  },
  tagTerm: {
    background: 'rgba(255,255,255,.04)',
    color: '#444455',
    border: '1px solid rgba(255,255,255,.07)',
  },

  errorBox: {
    margin: '0 20px',
    padding: '10px 14px',
    background: 'rgba(192,57,43,0.1)',
    border: '1px solid rgba(192,57,43,0.3)',
    borderRadius: 9,
    color: '#e07a6f',
    fontSize: 12,
    fontFamily: 'Syne, sans-serif',
  },

  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '14px 20px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  urlInput: {
    flex: 1,
    padding: '9px 13px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 9,
    color: '#f0eff5',
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    outline: 'none',
  },
  analyzeBtn: {
    padding: '9px 16px',
    background: '#1a8f7a',
    border: 'none',
    borderRadius: 9,
    color: 'white',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Syne, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    transition: 'opacity .2s',
  },
  spinner: {
    width: 12, height: 12,
    border: '2px solid rgba(255,255,255,.2)',
    borderTopColor: 'white',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin .7s linear infinite',
  },

  ctaFooter: {
    padding: '14px 20px 18px',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  ctaNote: { fontSize: 12, color: '#444455', fontFamily: 'Syne, sans-serif' },
  ctaBtn: {
    padding: '8px 18px',
    background: 'transparent',
    border: '1px solid rgba(26,143,122,.35)',
    borderRadius: 8,
    color: '#1a8f7a',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Syne, sans-serif',
    transition: 'all .15s',
    whiteSpace: 'nowrap',
  },
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    background: '#0a0a0f',
    minHeight: '100vh',
    color: '#f0eff5',
    fontFamily: "'Syne', sans-serif",
  },

  // ── NAV ──
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 48px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(10,10,15,0.8)',
    backdropFilter: 'blur(20px)',
  },
  navLogo: { display: 'flex', alignItems: 'baseline', gap: 8 },
  navBird: { fontSize: 22, display: 'inline-block', animation: 'bob 3s ease-in-out infinite' },
  navName: { fontFamily: "'Instrument Serif', serif", fontSize: 22, color: '#f0eff5' },
  navLinks: { display: 'flex', alignItems: 'center', gap: 32 },
  navLink: {
    fontSize: 13, color: '#8888aa', fontWeight: 600,
    letterSpacing: '0.03em', cursor: 'pointer', transition: 'color 0.2s',
    background: 'none', border: 'none', padding: 0,
  },
  navTutorial: {
    fontSize: 13, color: '#555566', fontWeight: 600,
    letterSpacing: '0.03em', cursor: 'pointer', transition: 'color 0.2s',
    background: 'none', border: 'none', padding: 0,
    display: 'flex', alignItems: 'center', gap: 5,
  },
  navCta: {
    padding: '9px 22px', background: '#1a8f7a', color: 'white',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
    letterSpacing: '0.03em', cursor: 'pointer', transition: 'all 0.2s',
  },

  // ── HERO ──
  hero: {
    paddingTop: 160, paddingBottom: 80,
    textAlign: 'center', maxWidth: 820, margin: '0 auto',
    padding: '160px 32px 80px',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 16px', borderRadius: 100,
    border: '1px solid rgba(26,143,122,0.4)',
    background: 'rgba(26,143,122,0.08)',
    fontSize: 12, color: '#1a8f7a', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: 32,
  },
  h1: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 'clamp(48px, 7vw, 80px)',
    lineHeight: 1.05, letterSpacing: '-1px',
    marginBottom: 24, color: '#f0eff5',
  },
  h1Em: { fontStyle: 'italic', color: '#1a8f7a' },
  subhead: {
    fontSize: 18, color: '#8888aa', lineHeight: 1.7,
    maxWidth: 560, margin: '0 auto 48px',
  },
  ctaRow: {
    display: 'flex', gap: 14, justifyContent: 'center',
    alignItems: 'center', flexWrap: 'wrap',
  },
  ctaPrimary: {
    padding: '14px 32px', background: '#1a8f7a', color: 'white',
    border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  ctaSecondary: {
    padding: '14px 32px', background: 'transparent', color: '#f0eff5',
    border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10,
    fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
  },

  // ── DEMO SECTION ──
  demoSection: {
    maxWidth: 1000, margin: '0 auto', padding: '0 32px 120px',
  },
  demoLabel: {
    textAlign: 'center',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: '#333344',
    marginBottom: 20,
    fontFamily: "'DM Mono', monospace",
  },

  // ── FEATURES ──
  featuresSection: {
    maxWidth: 1100, margin: '0 auto', padding: '0 32px 120px',
  },
  sectionLabel: {
    textAlign: 'center', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: '#1a8f7a', marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 'clamp(32px, 4vw, 48px)', textAlign: 'center',
    color: '#f0eff5', marginBottom: 64, lineHeight: 1.2,
  },
  featureGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 20,
  },
  featureCard: {
    padding: '32px', borderRadius: 16,
    background: '#111118', border: '1px solid rgba(255,255,255,0.07)',
    transition: 'border-color 0.3s, transform 0.2s',
  },
  featureIcon: { fontSize: 32, marginBottom: 16 },
  featureTitle: { fontSize: 18, fontWeight: 700, color: '#f0eff5', marginBottom: 10 },
  featureDesc: { fontSize: 14, color: '#8888aa', lineHeight: 1.7 },

  // ── HOW IT WORKS ──
  howSection: {
    maxWidth: 900, margin: '0 auto', padding: '0 32px 120px',
  },
  steps: { display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' },
  step: {
    display: 'flex', gap: 32, alignItems: 'flex-start',
    padding: '40px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  stepNum: {
    width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
    background: 'rgba(26,143,122,0.1)', border: '1.5px solid rgba(26,143,122,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontFamily: "'Instrument Serif', serif", color: '#1a8f7a',
  },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 20, fontWeight: 700, color: '#f0eff5', marginBottom: 8 },
  stepDesc: { fontSize: 14, color: '#8888aa', lineHeight: 1.7 },
  stepCode: {
    marginTop: 12, padding: '10px 14px',
    background: '#0a0a0f', borderRadius: 8,
    fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#1a8f7a',
    border: '1px solid rgba(26,143,122,0.2)',
  },

  // ── CTA BANNER ──
  ctaBanner: {
    maxWidth: 800, margin: '0 auto', padding: '0 32px 160px',
    textAlign: 'center',
  },
  bannerBox: {
    padding: '64px 48px', borderRadius: 24,
    background: 'linear-gradient(135deg, rgba(26,143,122,0.12) 0%, rgba(123,94,167,0.08) 100%)',
    border: '1px solid rgba(26,143,122,0.2)',
  },
  bannerTitle: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 'clamp(28px, 4vw, 44px)', color: '#f0eff5',
    marginBottom: 16, lineHeight: 1.2,
  },
  bannerSub: { fontSize: 16, color: '#8888aa', marginBottom: 36 },

  // ── FOOTER ──
  footer: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '32px 48px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 16,
  },
  footerText: { fontSize: 13, color: '#555566' },
  footerTutorial: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 13, color: '#444455',
    textDecoration: 'none', cursor: 'pointer',
    transition: 'color .2s',
  },
}

const FEATURES = [
  { icon: '🕸',  title: 'Knowledge Graph',    desc: 'Every article you save becomes a node in your personal knowledge graph. Shared concepts create connections automatically — no manual linking required.' },
  { icon: '🔬',  title: 'Deep NLP Analysis',  desc: 'Free tier includes TextRank summarization, TF-IDF keywords, co-occurrence graphs, sentiment arc, readability stats, and named entity recognition.' },
  { icon: '📦',  title: 'GitHub Project Mode',desc: 'Drop any GitHub URL and get an instant structured breakdown — tech stack, features, file structure, contributors, and commit activity.' },
  { icon: '🪨',  title: 'Obsidian Native',    desc: 'Notes saved directly to your vault with [[wikilinks]] woven in. Works via a local REST API plugin — your data never leaves your machine.' },
  { icon: '✨',  title: 'Claude Pro Tier',    desc: 'Bring your own Anthropic key for Claude-powered summaries. Better quality, smarter wikilinks, and "go deeper" Q&A on any content.' },
  { icon: '🔒',  title: 'Your Keys, Your Data',desc: 'MagPie never stores your API keys on its servers. Keys are used per-request and never logged. Your vault stays on your machine.' },
]

const STEPS = [
  {
    title: 'Paste any URL',
    desc: 'Articles, blog posts, documentation, research papers — anything with text. Or drop a GitHub repo link for project analysis.',
    code: 'https://example.com/article  or  https://github.com/owner/repo',
  },
  {
    title: 'MagPie extracts the knowledge',
    desc: 'Our free NLP pipeline summarizes, tags, extracts entities, scores sentiment, and identifies key concepts — all locally, no API calls.',
    code: 'TextRank → TF-IDF → spaCy NER → co-occurrence graph',
  },
  {
    title: 'Your vault grows smarter',
    desc: 'Notes are saved to Obsidian with wikilinks. The more you crawl, the richer the graph — shared concepts link articles automatically.',
    code: '[[Neural Networks]] connects 12 notes across 3 topics',
  },
]

// ── Landing page ──────────────────────────────────────────────────────────────

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false)

  // Tutorial video modal state (lightweight — just a YouTube embed for now)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  return (
    <div style={styles.page}>
      {/* NAV */}
      <nav style={styles.nav}>
        <div style={styles.navLogo}>
          <span style={styles.navBird}>🐦‍⬛</span>
          <span style={styles.navName}>MagPie</span>
        </div>
        <div style={styles.navLinks}>
          <button style={styles.navLink} onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
          <button style={styles.navLink} onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          {/* Tutorial lives here in the nav — unobtrusive, discoverable */}
          <button style={styles.navTutorial} onClick={() => setTutorialOpen(true)}>
            ▶ Tutorial
          </button>
          <button style={styles.navLink} onClick={() => setAuthOpen(true)}>Sign in</button>
          <button style={styles.navCta} onClick={() => setAuthOpen(true)}>Get started free</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={styles.hero}>
        <div className="fade-up" style={styles.badge}>
          <span>🐦‍⬛</span> Now in beta
        </div>
        <h1 className="fade-up" style={{ ...styles.h1, animationDelay: '0.1s' }}>
          Turn the web into your<br />
          <em style={styles.h1Em}>knowledge base</em>
        </h1>
        <p className="fade-up" style={{ ...styles.subhead, animationDelay: '0.2s' }}>
          MagPie crawls any article or GitHub repo, extracts knowledge with NLP,
          and saves richly linked notes directly into your Obsidian vault.
          Free forever. No AI required.
        </p>
        <div className="fade-up" style={{ ...styles.ctaRow, animationDelay: '0.3s' }}>
          <button style={styles.ctaPrimary} onClick={() => setAuthOpen(true)}>
            Start for free <span>→</span>
          </button>
          <button style={styles.ctaSecondary} onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
            See how it works
          </button>
        </div>
      </section>

      {/* LIVE DEMO (replaces the old video placeholder) */}
      <section style={styles.demoSection}>
        <div style={styles.demoLabel}>interactive demo — try it now</div>
        <DemoGraph onSignIn={() => setAuthOpen(true)} />
      </section>

      {/* FEATURES */}
      <section id="features" style={styles.featuresSection}>
        <div style={styles.sectionLabel}>Features</div>
        <h2 style={styles.sectionTitle}>
          Everything you need to<br />build a second brain
        </h2>
        <div style={styles.featureGrid}>
          {FEATURES.map((f, i) => (
            <div key={i} style={styles.featureCard}>
              <div style={styles.featureIcon}>{f.icon}</div>
              <div style={styles.featureTitle}>{f.title}</div>
              <div style={styles.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={styles.howSection}>
        <div style={styles.sectionLabel}>How it works</div>
        <h2 style={styles.sectionTitle}>Three steps to a smarter vault</h2>
        <div style={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={i} style={styles.step}>
              <div style={styles.stepNum}>{i + 1}</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>{s.title}</div>
                <div style={styles.stepDesc}>{s.desc}</div>
                <div style={styles.stepCode}>{s.code}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={styles.ctaBanner}>
        <div style={styles.bannerBox}>
          <h2 style={styles.bannerTitle}>
            Your vault is waiting<br />to get smarter
          </h2>
          <p style={styles.bannerSub}>
            Free forever. No credit card. Bring your own API keys for the pro tier.
          </p>
          <button style={styles.ctaPrimary} onClick={() => setAuthOpen(true)}>
            Get started with Google →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={{ ...styles.navLogo }}>
          <span style={{ fontSize: 18 }}>🐦‍⬛</span>
          <span style={{ ...styles.navName, fontSize: 16 }}>MagPie</span>
        </div>
        <div style={styles.footerText}>Built with crawl4ai · spaCy · Claude · Obsidian</div>
        {/* Tutorial link repeated in footer for discoverability */}
        <button style={styles.footerTutorial} onClick={() => setTutorialOpen(true)}>
          <span>▶</span> Watch the tutorial
        </button>
        <div style={styles.footerText}>© 2025 MagPie</div>
      </footer>

      {/* AUTH MODAL */}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      {/* TUTORIAL MODAL — lightweight overlay, swap src for your real video when ready */}
      {tutorialOpen && (
        <div
          style={tutorialOverlay}
          onClick={e => e.target === e.currentTarget && setTutorialOpen(false)}
        >
          <div style={tutorialModal}>
            <button style={tutorialClose} onClick={() => setTutorialOpen(false)}>✕</button>
            <div style={tutorialAspect}>
              {/* Swap this placeholder for your real YouTube/Loom embed URL */}
              <div style={tutorialPlaceholder}>
                <div style={{ fontSize: 40, marginBottom: 12, animation: 'bob 2s ease-in-out infinite' }}>🐦‍⬛</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#8888aa' }}>
                  Tutorial video coming soon
                </div>
                <div style={{ fontSize: 12, color: '#444455', marginTop: 8 }}>
                  Replace this with your Loom or YouTube embed
                </div>
              </div>
              {/*
                When you have a video, replace the placeholder div above with:
                <iframe
                  src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
                  style={{ position:'absolute',inset:0,width:'100%',height:'100%',border:'none',borderRadius:16 }}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              */}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const tutorialOverlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, animation: 'fadeIn 0.2s ease-out',
}
const tutorialModal = {
  background: '#111118', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20, width: '100%', maxWidth: 860,
  position: 'relative', animation: 'fadeUp 0.3s ease-out',
  overflow: 'hidden',
}
const tutorialClose = {
  position: 'absolute', top: 14, right: 16, zIndex: 10,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '50%', width: 32, height: 32,
  color: '#8888aa', fontSize: 14, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const tutorialAspect = {
  position: 'relative', paddingBottom: '56.25%', height: 0,
}
const tutorialPlaceholder = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  background: '#0a0a0f',
}