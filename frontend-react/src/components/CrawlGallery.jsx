import React, { useState, useMemo } from 'react'
import { deleteCrawl } from '../lib/supabase'

function Icon({ name, size = 14, style = {} }) {
  return <i className={`ti ti-${name}`} aria-hidden="true" style={{ fontSize: size, lineHeight: 1, ...style }} />
}

// ── Mini graph per card ───────────────────────────────────────────────────────
function CardGraph({ item }) {
  const ref = React.useRef(null)
  React.useEffect(() => { if (ref.current) renderMini() }, [item])

  async function renderMini() {
    const d3 = await import('d3')
    const el = ref.current
    if (!el) return
    const svg = d3.select(el)
    svg.selectAll('*').remove()
    const W = 260, H = 130
    const nodes = [], edges = [], seen = {}, c = { n: 0 }
    const mkId = p => `${p}_${c.n++}`
    const leaf = (label, type) => {
      const key = `${type}::${label.toLowerCase()}`
      if (!seen[key]) { seen[key] = mkId(type); nodes.push({ id: seen[key], type }) }
      return seen[key]
    }
    const rootId = mkId('root')
    nodes.push({ id: rootId, type: item.type || 'article' })
    const COLORS = { article: '#1a8f7a', project: '#7b5ea7', term: '#1a6b8a', concept: '#c97a20', idea: '#2e7d6b', question: '#b06a00' }
    const RADII  = { article: 10, project: 12, term: 4, concept: 5, idea: 4, question: 4 }
    if (item.type === 'project') {
      ;(item.tech_stack || []).slice(0, 6).forEach(t => edges.push({ source: rootId, target: leaf(t, 'term') }))
      ;(item.key_concepts || []).slice(0, 4).forEach(c => edges.push({ source: rootId, target: leaf(c, 'concept') }))
    } else {
      ;(item.key_terms || []).slice(0, 5).forEach(t => edges.push({ source: rootId, target: leaf(t, 'term') }))
      ;(item.main_ideas || []).slice(0, 3).forEach(i => edges.push({ source: rootId, target: leaf(i, 'idea') }))
      ;(item.questions || []).slice(0, 2).forEach(q => edges.push({ source: rootId, target: leaf(q, 'question') }))
    }
    const g = svg.append('g')
    g.append('g').selectAll('line').data(edges).join('line')
      .attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-width', 1)
    const node = g.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', d => RADII[d.type] || 5).attr('fill', d => COLORS[d.type] || '#555').attr('opacity', 0.9)
    d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(30))
      .force('charge', d3.forceManyBody().strength(-50))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (RADII[d.type] || 5) + 3))
      .on('tick', () => {
        g.selectAll('line').attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('cx', d => d.x).attr('cy', d => d.y)
      })
  }
  return <svg ref={ref} width={260} height={130} style={{ display: 'block' }} />
}

// ── Export modal ──────────────────────────────────────────────────────────────
function ExportModal({ items, onClose }) {
  const [format, setFormat] = useState('markdown')
  const [scope, setScope] = useState('filtered') // 'filtered' | 'selected'
  const [copied, setCopied] = useState(false)

  function buildMarkdown(entries) {
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const articles = entries.filter(e => e.type !== 'project')
    const projects = entries.filter(e => e.type === 'project')

    let out = `# MagPie Knowledge Export\n`
    out += `Generated: ${date} · ${entries.length} entries\n\n`

    // Aggregate key terms across all articles for quick overview
    const allTerms = {}
    articles.forEach(e => (e.key_terms || []).forEach(t => { allTerms[t] = (allTerms[t] || 0) + 1 }))
    const topTerms = Object.entries(allTerms).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t)
    if (topTerms.length) {
      out += `## Top Concepts Across All Sources\n`
      out += topTerms.map(t => `\`${t}\``).join(' · ') + '\n\n'
    }

    if (articles.length) {
      out += `---\n\n## Articles (${articles.length})\n\n`
      articles.forEach(e => {
        out += `### ${e.title}\n`
        out += `**Source:** ${e.url}\n`
        out += `**Crawled:** ${new Date(e.crawled_at).toLocaleDateString()}\n`
        if (e.stats?.reading_level) out += `**Level:** ${e.stats.reading_level} · ~${e.stats.estimated_read_minutes} min read · ${e.stats.word_count?.toLocaleString()} words\n`
        out += `\n`
        if (e.summary) out += `**Summary:** ${e.summary}\n\n`
        if (e.main_ideas?.length) {
          out += `**Main Ideas:**\n`
          e.main_ideas.forEach(i => out += `> ${i}\n`)
          out += `\n`
        }
        if (e.key_terms?.length) out += `**Key Terms:** ${e.key_terms.join(', ')}\n\n`
        if (e.entities?.length)  out += `**Entities:** ${e.entities.join(', ')}\n\n`
        if (e.questions?.length) {
          out += `**Key Questions:**\n`
          e.questions.forEach(q => out += `- ${q}\n`)
          out += `\n`
        }
        if (e.sentiment_arc?.length) {
          out += `**Sentiment Arc:** `
          out += e.sentiment_arc.map(s => `${s.section}: ${s.emoji} ${s.label}`).join(' → ')
          out += `\n\n`
        }
        if (e.tags?.length) out += `**Tags:** ${e.tags.map(t => `#${t}`).join(' ')}\n\n`
        out += `---\n\n`
      })
    }

    if (projects.length) {
      out += `## Projects (${projects.length})\n\n`
      projects.forEach(e => {
        out += `### ${e.title}\n`
        out += `**Source:** ${e.url}\n`
        if (e.stars) out += `**Stars:** ${e.stars?.toLocaleString()} · **Forks:** ${e.forks?.toLocaleString()}\n`
        if (e.description) out += `\n${e.description}\n`
        if (e.tech_stack?.length) out += `\n**Tech Stack:** ${e.tech_stack.slice(0, 12).join(', ')}\n`
        if (e.key_concepts?.length) out += `**Key Concepts:** ${e.key_concepts.slice(0, 10).join(', ')}\n`
        if (e.features?.length) {
          out += `\n**Features:**\n`
          e.features.forEach(f => out += `- ${f}\n`)
        }
        out += `\n---\n\n`
      })
    }

    return out.trim()
  }

  function buildJSON(entries) {
    // Structured for RAG / LLM Studio import
    const payload = {
      export_meta: {
        source: 'MagPie Knowledge Graph',
        generated_at: new Date().toISOString(),
        entry_count: entries.length,
        article_count: entries.filter(e => e.type !== 'project').length,
        project_count: entries.filter(e => e.type === 'project').length,
      },
      global_context: {
        top_terms: (() => {
          const freq = {}
          entries.forEach(e => (e.key_terms || []).forEach(t => { freq[t] = (freq[t] || 0) + 1 }))
          return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,25).map(([t,c]) => ({ term: t, frequency: c }))
        })(),
        all_entities: [...new Set(entries.flatMap(e => e.entities || []))].slice(0, 40),
        all_tags: [...new Set(entries.flatMap(e => e.tags || []))],
      },
      entries: entries.map(e => {
        const base = {
          id: e.id,
          type: e.type,
          url: e.url,
          title: e.title,
          crawled_at: e.crawled_at,
          tier: e.tier,
        }
        if (e.type === 'project') {
          return {
            ...base,
            description: e.description,
            stars: e.stars,
            forks: e.forks,
            primary_language: e.primary_language,
            tech_stack: e.tech_stack,
            key_concepts: e.key_concepts,
            features: e.features,
            topics: e.topics,
            activity: e.activity,
            contributors: (e.contributors || []).map(c => c.login || c),
          }
        }
        return {
          ...base,
          summary: e.summary,
          key_terms: e.key_terms,
          main_ideas: e.main_ideas,
          entities: e.entities,
          questions: e.questions,
          tags: e.tags,
          links: e.links,
          co_occurrences: e.co_occurrences,
          sentiment_arc: (e.sentiment_arc || []).map(s => ({ section: s.section, label: s.label, score: s.score })),
          stats: e.stats,
          related_links: (e.related_links || []).map(l => ({ label: l.label, url: l.url })),
          mode: e.mode,
        }
      }),
    }
    return JSON.stringify(payload, null, 2)
  }

  const content = format === 'markdown' ? buildMarkdown(items) : buildJSON(items)
  const ext = format === 'markdown' ? 'md' : 'json'
  const mimeType = format === 'markdown' ? 'text/markdown' : 'application/json'

  function handleDownload() {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `magpie-export-${new Date().toISOString().slice(0,10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const usageHints = {
    markdown: [
      { icon: 'brand-claude', label: 'Claude Projects', desc: 'Upload as a project file for persistent context' },
      { icon: 'message-chatbot', label: 'ChatGPT', desc: 'Paste into custom instructions or a conversation' },
      { icon: 'app-window', label: 'LLM Studio', desc: 'Import as a context document before chatting' },
      { icon: 'notebook', label: 'Obsidian', desc: 'Drop directly into your vault as a summary note' },
    ],
    json: [
      { icon: 'api', label: 'Custom RAG', desc: 'Load into LangChain, LlamaIndex, or any vector store' },
      { icon: 'app-window', label: 'LM Studio', desc: 'Use as structured context in API mode' },
      { icon: 'code', label: 'Your own pipeline', desc: 'Structured for easy chunking and embedding' },
      { icon: 'robot', label: 'Fine-tuning', desc: 'Convert entries to training examples' },
    ],
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,4,8,0.88)', backdropFilter: 'blur(10px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: '#0d0d16',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTop: '2px solid #1a8f7a',
        borderRadius: 18,
        boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
        fontFamily: "'Syne', sans-serif",
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(26,143,122,0.15)', border: '1px solid rgba(26,143,122,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="download" size={15} style={{ color: '#1a8f7a' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f0eff5' }}>Export knowledge graph</div>
            <div style={{ fontSize: 11, color: '#444455', marginTop: 2 }}>{items.length} {items.length === 1 ? 'entry' : 'entries'} · ready for any LLM workflow</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#444455', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Format picker */}
          <div style={{ padding: '18px 24px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Format</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { val: 'markdown', icon: 'markdown', label: 'Markdown', desc: 'Human-readable · works everywhere' },
                { val: 'json', icon: 'braces', label: 'JSON', desc: 'Structured · ideal for RAG pipelines' },
              ].map(f => (
                <button key={f.val} onClick={() => setFormat(f.val)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: format === f.val ? '1px solid rgba(26,143,122,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  background: format === f.val ? 'rgba(26,143,122,0.08)' : 'rgba(255,255,255,0.02)',
                  textAlign: 'left', fontFamily: 'Syne, sans-serif',
                  transition: 'all 0.15s',
                }}>
                  <Icon name={f.icon} size={18} style={{ color: format === f.val ? '#1a8f7a' : '#444455' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: format === f.val ? '#f0eff5' : '#8888aa' }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: '#444455', marginTop: 1 }}>{f.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Use-with hints */}
          <div style={{ padding: '16px 24px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Use with</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {usageHints[format].map(h => (
                <div key={h.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <Icon name={h.icon} size={13} style={{ color: '#333344', marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#8888aa' }}>{h.label}</div>
                    <div style={{ fontSize: 10, color: '#333344', marginTop: 1, lineHeight: 1.4 }}>{h.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={{ padding: '16px 24px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Preview</div>
            <pre style={{
              background: '#08080d', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 10, padding: '14px 16px',
              fontSize: 11, color: '#666677', lineHeight: 1.6,
              fontFamily: "'DM Mono', monospace",
              maxHeight: 180, overflowY: 'auto', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', margin: 0,
            }}>
              {content.slice(0, 800)}{content.length > 800 ? '\n\n… and more' : ''}
            </pre>
          </div>

          {/* Stats row */}
          <div style={{ padding: '14px 24px 0', display: 'flex', gap: 20 }}>
            {[
              { label: 'Size', val: content.length > 1024 ? `${(content.length / 1024).toFixed(1)} KB` : `${content.length} B` },
              { label: 'Articles', val: items.filter(e => e.type !== 'project').length },
              { label: 'Projects', val: items.filter(e => e.type === 'project').length },
              { label: 'Unique terms', val: [...new Set(items.flatMap(e => e.key_terms || []))].length },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f7a', fontFamily: "'Instrument Serif', serif" }}>{s.val}</div>
                <div style={{ fontSize: 10, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={handleCopy} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: copied ? '#1a8f7a' : '#8888aa', fontSize: 12, fontWeight: 700,
            fontFamily: 'Syne, sans-serif', transition: 'all 0.15s',
          }}>
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button onClick={handleDownload} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
            background: '#1a8f7a', border: 'none',
            color: 'white', fontSize: 12, fontWeight: 700,
            fontFamily: 'Syne, sans-serif',
          }}>
            <Icon name="download" size={13} />
            Download .{ext}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ item, onClose, onDelete, onExport, deleting }) {
  const isProject = item.type === 'project'
  const accentColor = isProject ? '#7b5ea7' : '#1a8f7a'

  const Section = ({ icon, title, items: sItems, color }) => {
    if (!sItems?.length) return null
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Icon name={icon} size={12} style={{ color: color || accentColor }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: color || accentColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sItems.map((si, i) => (
            <span key={i} style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 100,
              background: `${color || accentColor}18`, border: `1px solid ${color || accentColor}30`,
              color: '#c8c7d8', lineHeight: 1.4,
            }}>
              {typeof si === 'string' ? si.slice(0, 60) : JSON.stringify(si).slice(0, 60)}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,4,8,0.85)', backdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, maxHeight: '82vh', overflowY: 'auto',
        background: '#0d0d16',
        border: `1px solid ${accentColor}30`,
        borderTop: `2px solid ${accentColor}`,
        borderRadius: 18,
        boxShadow: `0 40px 100px rgba(0,0,0,0.7), 0 0 60px ${accentColor}10`,
        fontFamily: "'Syne', sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={isProject ? 'brand-github' : 'world'} size={16} style={{ color: accentColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f0eff5', marginBottom: 4, lineHeight: 1.3 }}>{item.title}</div>
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#444455', textDecoration: 'none', wordBreak: 'break-all' }}>
              {item.url}
            </a>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#444455', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {item.summary && (
            <div style={{ marginBottom: 22, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, borderLeft: `3px solid ${accentColor}50` }}>
              <p style={{ fontSize: 13, color: '#9999bb', lineHeight: 1.7, margin: 0 }}>{item.summary}</p>
            </div>
          )}

          {isProject && (item.stars > 0 || item.forks > 0) && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              {[
                { icon: 'star', val: item.stars?.toLocaleString(), label: 'Stars' },
                { icon: 'git-fork', val: item.forks?.toLocaleString(), label: 'Forks' },
                { icon: 'code', val: item.primary_language, label: 'Language' },
              ].filter(s => s.val).map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666677' }}>
                  <Icon name={s.icon} size={12} style={{ color: accentColor }} />
                  <span style={{ color: '#c8c7d8', fontWeight: 700 }}>{s.val}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {!isProject && item.stats?.word_count && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { icon: 'clock', val: `${item.stats.estimated_read_minutes} min`, label: 'read' },
                { icon: 'file-text', val: item.stats.word_count?.toLocaleString(), label: 'words' },
                { icon: 'school', val: item.stats.reading_level, label: 'level' },
              ].filter(s => s.val).map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666677' }}>
                  <Icon name={s.icon} size={12} style={{ color: accentColor }} />
                  <span style={{ color: '#c8c7d8', fontWeight: 700 }}>{s.val}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {isProject ? (<>
            <Section icon="layers-intersect" title="Tech Stack"   items={item.tech_stack}   color="#0d7377" />
            <Section icon="sparkles"         title="Features"     items={item.features}     color="#8b5e3c" />
            <Section icon="bulb"             title="Key Concepts" items={item.key_concepts} color="#7b5ea7" />
            <Section icon="users"            title="Contributors" items={(item.contributors || []).map(c => c.login || c)} color="#7b3f6e" />
            <Section icon="tag"              title="Topics"       items={item.topics}       color="#1a6b8a" />
          </>) : (<>
            <Section icon="message-question" title="Key Questions" items={item.questions}  color="#b06a00" />
            <Section icon="bulb"             title="Main Ideas"    items={item.main_ideas} color="#2e7d6b" />
            <Section icon="key"              title="Key Terms"     items={item.key_terms}  color="#1a8f7a" />
            <Section icon="building"         title="Entities"      items={item.entities}   color="#c97a20" />
            <Section icon="tag"              title="Tags"          items={item.tags}       color="#444466" />
          </>)}

          {item.sentiment_arc?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Icon name="wave-sine" size={12} style={{ color: '#7b4a8a' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7b4a8a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sentiment Arc</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {item.sentiment_arc.map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, textAlign: 'center', background: 'rgba(123,74,138,0.1)', border: '1px solid rgba(123,74,138,0.2)' }}>
                    <div style={{ fontSize: 16, marginBottom: 2 }}>{s.emoji}</div>
                    <div style={{ fontSize: 9, color: '#666677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.section}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#333344' }}>
            {new Date(item.crawled_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {item.tier && <span style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 100, background: 'rgba(255,255,255,0.05)', color: '#555566', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{item.tier}</span>}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onExport(item)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(26,143,122,0.25)',
              background: 'rgba(26,143,122,0.08)', color: '#1a8f7a',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif',
            }}>
              <Icon name="download" size={12} />Export
            </button>
            <button onClick={onDelete} disabled={deleting} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(192,57,43,0.25)',
              background: 'rgba(192,57,43,0.08)', color: '#e06c5a',
              fontSize: 12, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer',
              fontFamily: 'Syne, sans-serif', opacity: deleting ? 0.6 : 1,
            }}>
              <Icon name="trash" size={12} />{deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Gallery card ──────────────────────────────────────────────────────────────
function CrawlCard({ item, onSelect, onDelete }) {
  const isProject = item.type === 'project'
  const accentColor = isProject ? '#7b5ea7' : '#1a8f7a'
  const tags = isProject
    ? [...(item.tech_stack || []).slice(0, 3), ...(item.topics || []).slice(0, 2)]
    : [...(item.key_terms || []).slice(0, 4), ...(item.tags || []).slice(0, 2)]

  return (
    <div
      onClick={() => onSelect(item)}
      style={{
        background: '#0d0d16', border: '1px solid rgba(255,255,255,0.05)',
        borderTop: `2px solid ${accentColor}`, borderRadius: 14,
        overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.2s, transform 0.18s, box-shadow 0.18s',
        position: 'relative', display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = accentColor
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.4), 0 0 30px ${accentColor}12`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 100, background: `${accentColor}18`, border: `1px solid ${accentColor}30`, fontSize: 10, color: accentColor, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', zIndex: 2 }}>
        <Icon name={isProject ? 'brand-github' : 'world'} size={9} />
        {isProject ? 'Project' : 'Article'}
      </div>
      <div style={{ background: '#08080d', padding: '16px 0 8px', display: 'flex', justifyContent: 'center' }}>
        <CardGraph item={item} />
      </div>
      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0eff5', marginBottom: 6, lineHeight: 1.4, paddingRight: 20 }}>
          {item.title?.slice(0, 60)}{item.title?.length > 60 ? '…' : ''}
        </div>
        {item.summary && (
          <p style={{ fontSize: 11, color: '#555566', lineHeight: 1.6, margin: '0 0 12px', flex: 1 }}>
            {item.summary.slice(0, 100)}{item.summary.length > 100 ? '…' : ''}
          </p>
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {tags.slice(0, 5).map((tag, i) => (
              <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: `${accentColor}12`, border: `1px solid ${accentColor}22`, color: '#888899', lineHeight: 1 }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontSize: 10, color: '#333344' }}>
            {new Date(item.crawled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isProject && item.stars > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#444455' }}>
                <Icon name="star" size={10} style={{ color: '#c97a20' }} />{item.stars?.toLocaleString()}
              </span>
            )}
            {!isProject && item.stats?.estimated_read_minutes && (
              <span style={{ fontSize: 10, color: '#444455' }}>{item.stats.estimated_read_minutes} min read</span>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDelete(item) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2a2a38', padding: 4, borderRadius: 5, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e06c5a'}
              onMouseLeave={e => e.currentTarget.style.color = '#2a2a38'}
              title="Delete"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main gallery ──────────────────────────────────────────────────────────────
export default function CrawlGallery({ history, onDelete }) {
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [exportItems, setExportItems] = useState(null) // null = closed
  const [typeFilter, setTypeFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date_desc')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState(null)

  // Derive all tags across history for the tag cloud
  const allTags = useMemo(() => {
    const freq = {}
    history.forEach(item => {
      const tags = item.type === 'project'
        ? [...(item.topics || []), ...(item.tech_stack || []).slice(0, 3)]
        : [...(item.tags || []), ...(item.key_terms || []).slice(0, 3)]
      tags.forEach(t => { freq[t] = (freq[t] || 0) + 1 })
    })
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([tag, count]) => ({ tag, count }))
  }, [history])

  const filtered = useMemo(() => {
    let result = [...history]

    // Type filter
    if (typeFilter === 'articles') result = result.filter(i => i.type !== 'project')
    if (typeFilter === 'projects') result = result.filter(i => i.type === 'project')

    // Mode filter (articles only)
    if (modeFilter === 'surface')    result = result.filter(i => i.type === 'project' || i.mode === 'surface')
    if (modeFilter === 'deep_dive')  result = result.filter(i => i.type === 'project' || i.mode === 'deep_dive')
    if (modeFilter === 'claude')     result = result.filter(i => i.tier === 'claude')

    // Tag filter
    if (tagFilter) {
      result = result.filter(item => {
        const tags = item.type === 'project'
          ? [...(item.topics || []), ...(item.tech_stack || [])]
          : [...(item.tags || []), ...(item.key_terms || [])]
        return tags.some(t => t.toLowerCase() === tagFilter.toLowerCase())
      })
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(item =>
        item.title?.toLowerCase().includes(q) ||
        item.summary?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        (item.key_terms || []).some(t => t.toLowerCase().includes(q)) ||
        (item.tech_stack || []).some(t => t.toLowerCase().includes(q)) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (item.entities || []).some(t => t.toLowerCase().includes(q)) ||
        (item.key_concepts || []).some(t => t.toLowerCase().includes(q))
      )
    }

    // Sort
    switch (sortBy) {
      case 'date_desc': result.sort((a, b) => new Date(b.crawled_at) - new Date(a.crawled_at)); break
      case 'date_asc':  result.sort((a, b) => new Date(a.crawled_at) - new Date(b.crawled_at)); break
      case 'title':     result.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break
      case 'stars':     result.sort((a, b) => (b.stars || 0) - (a.stars || 0)); break
      case 'read_time': result.sort((a, b) => (b.stats?.estimated_read_minutes || 0) - (a.stats?.estimated_read_minutes || 0)); break
    }

    return result
  }, [history, typeFilter, modeFilter, sortBy, search, tagFilter])

  async function handleDelete(item) {
    setDeleting(true)
    try {
      if (item.id) await deleteCrawl(item.id)
      onDelete(item)
      setSelected(null)
    } catch (e) {
      console.error('[CrawlGallery] delete failed:', e)
    } finally {
      setDeleting(false)
    }
  }

  const hasActiveFilters = typeFilter !== 'all' || modeFilter !== 'all' || search || tagFilter

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Syne', sans-serif" }}>

      {/* ── Toolbar ── */}
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: '#f0eff5', margin: 0, marginRight: 4 }}>
            Crawls
            <span style={{ fontSize: 14, color: '#333344', fontWeight: 400, marginLeft: 10, fontFamily: 'Syne, sans-serif' }}>
              {filtered.length}{filtered.length !== history.length ? ` of ${history.length}` : ''} {filtered.length === 1 ? 'item' : 'items'}
            </span>
          </h2>

          <div style={{ flex: 1 }} />

          {/* Export button */}
          <button
            onClick={() => setExportItems(filtered)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(26,143,122,0.08)', border: '1px solid rgba(26,143,122,0.2)',
              color: '#1a8f7a', fontSize: 12, fontWeight: 700,
              fontFamily: 'Syne, sans-serif', transition: 'all 0.15s',
            }}
          >
            <Icon name="download" size={13} />
            Export {filtered.length > 0 && filtered.length < history.length ? `${filtered.length} filtered` : 'all'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Type filter */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
            {[['all', 'stack-2', 'All'], ['articles', 'world', 'Articles'], ['projects', 'brand-github', 'Projects']].map(([val, icon, label]) => (
              <button key={val} onClick={() => setTypeFilter(val)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 6, border: 'none',
                background: typeFilter === val ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: typeFilter === val ? '#f0eff5' : '#444455',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', letterSpacing: '0.04em', transition: 'all 0.15s',
              }}>
                <Icon name={icon} size={11} />{label}
              </button>
            ))}
          </div>

          {/* Mode filter */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
            {[['all', 'Any depth'], ['surface', 'Surface'], ['deep_dive', 'Deep'], ['claude', '✨ Claude']].map(([val, label]) => (
              <button key={val} onClick={() => setModeFilter(val)} style={{
                padding: '5px 11px', borderRadius: 6, border: 'none',
                background: modeFilter === val ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: modeFilter === val ? '#f0eff5' : '#444455',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.04)', color: '#8888aa',
              fontSize: 11, fontFamily: 'Syne, sans-serif', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="stars">Most stars</option>
            <option value="read_time">Longest read</option>
          </select>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 12px', flex: 1, maxWidth: 260 }}>
            <Icon name="search" size={12} style={{ color: '#333344', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search titles, terms, entities…"
              style={{ background: 'none', border: 'none', outline: 'none', color: '#f0eff5', fontSize: 11, fontFamily: 'Syne, sans-serif', width: '100%' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#333344', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <Icon name="x" size={11} />
              </button>
            )}
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={() => { setTypeFilter('all'); setModeFilter('all'); setSearch(''); setTagFilter(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(192,57,43,0.2)', background: 'rgba(192,57,43,0.06)', color: '#e06c5a', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}
            >
              <Icon name="x" size={11} />Clear
            </button>
          )}
        </div>

        {/* Tag cloud */}
        {allTags.length > 0 && !search && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
            {allTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                style={{
                  padding: '3px 9px', borderRadius: 100, border: 'none', cursor: 'pointer',
                  background: tagFilter === tag ? 'rgba(26,143,122,0.2)' : 'rgba(255,255,255,0.04)',
                  color: tagFilter === tag ? '#1a8f7a' : '#444455',
                  fontSize: 10, fontWeight: 700, fontFamily: 'Syne, sans-serif',
                  transition: 'all 0.15s',
                }}
              >
                {tag}
                {count > 1 && <span style={{ marginLeft: 4, opacity: 0.6 }}>{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 40px' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 14, color: '#2a2a38' }}>
            <Icon name={search || hasActiveFilters ? 'search-off' : 'stack-2'} size={40} />
            <span style={{ fontSize: 14 }}>
              {search ? `No results for "${search}"` : hasActiveFilters ? 'No matches for these filters' : 'Nothing crawled yet'}
            </span>
            {hasActiveFilters && (
              <button onClick={() => { setTypeFilter('all'); setModeFilter('all'); setSearch(''); setTagFilter(null) }}
                style={{ fontSize: 12, color: '#1a8f7a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map((item, i) => (
              <CrawlCard key={item.id || i} item={item} onSelect={setSelected} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <DetailPanel
          item={selected}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected)}
          onExport={item => { setSelected(null); setExportItems([item]) }}
          deleting={deleting}
        />
      )}

      {/* ── Export modal ── */}
      {exportItems && (
        <ExportModal items={exportItems} onClose={() => setExportItems(null)} />
      )}
    </div>
  )
}