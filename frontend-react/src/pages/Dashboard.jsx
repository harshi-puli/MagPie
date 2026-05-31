import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut, getProfile, getCrawls, saveCrawl, upsertProfile, ensureProfile, deleteCrawl } from '../lib/supabase'
import { crawlUrl, analyzeProject, checkStatus } from '../lib/api'
import GraphView from '../components/GraphView'
import ResultCard from '../components/ResultCard'
import CrawlGallery from '../components/CrawlGallery'

function Icon({ name, size = 15, style = {} }) {
  return <i className={`ti ti-${name}`} aria-hidden="true" style={{ fontSize: size, lineHeight: 1, ...style }} />
}

function InitialsAvatar({ name, email, size = 52 }) {
  const raw = name || email || '?'
  const parts = raw.includes(' ') ? raw.split(' ') : [raw]
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : raw.slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(26,143,122,0.12)', border: '1.5px solid rgba(26,143,122,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, color: '#1a8f7a', fontWeight: 700,
      letterSpacing: '0.04em', flexShrink: 0, userSelect: 'none',
    }}>{initials}</div>
  )
}

// ── History Feed ──────────────────────────────────────────────────────────────
function HistoryFeed({ history, onDelete, onNewCrawl }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date_desc')
  const [expandedId, setExpandedId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const filtered = useMemo(() => {
    let result = [...history]
    if (typeFilter === 'articles') result = result.filter(i => i.type !== 'project')
    if (typeFilter === 'projects') result = result.filter(i => i.type === 'project')
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
    switch (sortBy) {
      case 'date_asc':  result.sort((a, b) => new Date(a.crawled_at) - new Date(b.crawled_at)); break
      case 'title':     result.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break
      case 'stars':     result.sort((a, b) => (b.stars || 0) - (a.stars || 0)); break
      case 'read_time': result.sort((a, b) => (b.stats?.estimated_read_minutes || 0) - (a.stats?.estimated_read_minutes || 0)); break
      default:          result.sort((a, b) => new Date(b.crawled_at) - new Date(a.crawled_at))
    }
    return result
  }, [history, typeFilter, sortBy, search])

  async function handleDelete(item) {
    setDeleting(item.id || item.url)
    try {
      if (item.id) await deleteCrawl(item.id)
      onDelete(item)
      setExpandedId(null)
    } catch (e) {
      console.error('[HistoryFeed] delete failed:', e)
    } finally {
      setDeleting(null)
    }
  }

  function exportItem(item) {
    const isProject = item.type === 'project'
    const lines = [
      `# ${item.title}`,
      `**Source:** ${item.url}`,
      `**Date:** ${new Date(item.crawled_at).toLocaleDateString()}`,
      '',
    ]
    if (item.summary || item.description) lines.push(`**Summary:** ${item.summary || item.description}`, '')
    if (!isProject) {
      if (item.main_ideas?.length) { lines.push('**Main Ideas:**'); item.main_ideas.forEach(i => lines.push(`> ${i}`)); lines.push('') }
      if (item.key_terms?.length) lines.push(`**Key Terms:** ${item.key_terms.join(', ')}`, '')
      if (item.entities?.length)  lines.push(`**Entities:** ${item.entities.join(', ')}`, '')
      if (item.questions?.length) { lines.push('**Key Questions:**'); item.questions.forEach(q => lines.push(`- ${q}`)); lines.push('') }
      if (item.sentiment_arc?.length) lines.push(`**Sentiment:** ${item.sentiment_arc.map(s => `${s.section}: ${s.emoji} ${s.label}`).join(' → ')}`, '')
      if (item.stats?.word_count) lines.push(`**Stats:** ${item.stats.reading_level} · ${item.stats.estimated_read_minutes} min · ${item.stats.word_count?.toLocaleString()} words`, '')
    } else {
      if (item.tech_stack?.length) lines.push(`**Tech Stack:** ${item.tech_stack.slice(0, 12).join(', ')}`, '')
      if (item.key_concepts?.length) lines.push(`**Key Concepts:** ${item.key_concepts.slice(0, 10).join(', ')}`, '')
      if (item.features?.length) { lines.push('**Features:**'); item.features.forEach(f => lines.push(`- ${f}`)); lines.push('') }
    }
    const content = lines.join('\n')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.title?.replace(/[^a-z0-9]/gi, '-').slice(0, 40) || 'crawl'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyUrl(item, e) {
    e.stopPropagation()
    navigator.clipboard.writeText(item.url).then(() => {
      setCopiedId(item.id || item.url)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const hasFilters = typeFilter !== 'all' || search

  return (
    <div style={scrollArea}>
      <div style={pageContent}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={pageHeading}>
            History
            <span style={{ fontSize: 14, color: '#333344', fontWeight: 400, marginLeft: 10, fontFamily: 'Syne, sans-serif' }}>
              {filtered.length}{filtered.length !== history.length ? ` of ${history.length}` : ''} items
            </span>
          </h2>
          <button style={fabBtn} onClick={onNewCrawl}>
            <Icon name="plus" size={13} style={{ marginRight: 5 }} />New crawl
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12 }}>
          {/* Type pills */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
            {[['all', 'stack-2', 'All'], ['articles', 'world', 'Articles'], ['projects', 'brand-github', 'Projects']].map(([val, icon, label]) => (
              <button key={val} onClick={() => setTypeFilter(val)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 6, border: 'none',
                background: typeFilter === val ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: typeFilter === val ? '#f0eff5' : '#444455',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', transition: 'all 0.15s',
              }}>
                <Icon name={icon} size={11} />{label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.04)', color: '#8888aa',
            fontSize: 11, fontFamily: 'Syne, sans-serif', cursor: 'pointer', outline: 'none',
          }}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="stars">Most stars</option>
            <option value="read_time">Longest read</option>
          </select>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 180 }}>
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

          {hasFilters && (
            <button onClick={() => { setTypeFilter('all'); setSearch('') }} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8,
              border: '1px solid rgba(192,57,43,0.2)', background: 'rgba(192,57,43,0.06)',
              color: '#e06c5a', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif',
            }}>
              <Icon name="x" size={11} />Clear
            </button>
          )}
        </div>

        {/* Feed */}
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', color: '#2a2a38', gap: 14 }}>
            <Icon name={hasFilters ? 'search-off' : 'clock'} size={36} />
            <span style={{ fontSize: 14 }}>{hasFilters ? `No results for "${search || typeFilter}"` : 'Nothing crawled yet'}</span>
            {hasFilters && (
              <button onClick={() => { setTypeFilter('all'); setSearch('') }} style={{ fontSize: 12, color: '#1a8f7a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filtered.map((item, i) => {
              const isProject = item.type === 'project'
              const accentColor = isProject ? '#7b5ea7' : '#1a8f7a'
              const itemKey = item.id || item.url || i
              const isExpanded = expandedId === itemKey
              const isDeleting = deleting === (item.id || item.url)

              const chips = isProject
                ? [...(item.tech_stack || []).slice(0, 4), ...(item.topics || []).slice(0, 2)]
                : [...(item.key_terms || []).slice(0, 5), ...(item.tags || []).slice(0, 2)]

              return (
                <div key={itemKey} style={{ borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s' }}>
                  {/* Row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : itemKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 16px', cursor: 'pointer',
                      background: isExpanded ? '#111120' : '#0e0e16',
                      border: `1px solid ${isExpanded ? accentColor + '40' : 'rgba(255,255,255,0.05)'}`,
                      borderBottom: isExpanded ? 'none' : undefined,
                      borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#111120' }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#0e0e16' }}
                  >
                    {/* Type dot */}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0, opacity: 0.8 }} />

                    {/* Title + chips */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f0eff5', marginBottom: chips.length ? 5 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      {chips.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {chips.slice(0, 6).map((chip, ci) => (
                            <span key={ci} style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 100,
                              background: `${accentColor}12`, color: '#666677',
                              border: `1px solid ${accentColor}20`,
                            }}>{chip}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      {isProject && item.stars > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#444455' }}>
                          <Icon name="star" size={11} style={{ color: '#c97a20' }} />{item.stars?.toLocaleString()}
                        </span>
                      )}
                      {!isProject && item.stats?.estimated_read_minutes && (
                        <span style={{ fontSize: 11, color: '#444455' }}>{item.stats.estimated_read_minutes} min</span>
                      )}
                      {item.tier === 'claude' && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: 'rgba(26,143,122,0.1)', color: '#1a8f7a', fontWeight: 700 }}>✨</span>
                      )}
                      <span style={{ fontSize: 11, color: '#333344' }}>
                        {new Date(item.crawled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        onClick={e => copyUrl(item, e)}
                        title="Copy URL"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === (item.id || item.url) ? '#1a8f7a' : '#2a2a38', padding: 3, display: 'flex', transition: 'color 0.15s' }}
                      >
                        <Icon name={copiedId === (item.id || item.url) ? 'check' : 'link'} size={13} />
                      </button>
                      <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} style={{ color: '#333344' }} />
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div style={{
                      background: '#111120',
                      border: `1px solid ${accentColor}40`,
                      borderTop: `1px solid ${accentColor}20`,
                      borderRadius: '0 0 12px 12px',
                      padding: '16px 20px 18px',
                    }}>
                      {/* Summary */}
                      {(item.summary || item.description) && (
                        <p style={{ fontSize: 13, color: '#9999bb', lineHeight: 1.7, margin: '0 0 16px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft: `3px solid ${accentColor}40` }}>
                          {item.summary || item.description}
                        </p>
                      )}

                      {/* Project stats */}
                      {isProject && (item.stars > 0 || item.primary_language) && (
                        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                          {[
                            { icon: 'star', val: item.stars?.toLocaleString(), label: 'stars' },
                            { icon: 'git-fork', val: item.forks?.toLocaleString(), label: 'forks' },
                            { icon: 'code', val: item.primary_language, label: '' },
                            { icon: 'activity', val: item.activity, label: '' },
                          ].filter(s => s.val).map(s => (
                            <span key={s.label + s.val} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666677' }}>
                              <Icon name={s.icon} size={11} style={{ color: accentColor }} />
                              <span style={{ color: '#c8c7d8', fontWeight: 700 }}>{s.val}</span>
                              {s.label && <span>{s.label}</span>}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Article stats */}
                      {!isProject && item.stats?.word_count && (
                        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                          {[
                            { icon: 'clock', val: `${item.stats.estimated_read_minutes} min`, label: 'read' },
                            { icon: 'file-text', val: item.stats.word_count?.toLocaleString(), label: 'words' },
                            { icon: 'school', val: item.stats.reading_level, label: 'level' },
                          ].filter(s => s.val).map(s => (
                            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666677' }}>
                              <Icon name={s.icon} size={11} style={{ color: accentColor }} />
                              <span style={{ color: '#c8c7d8', fontWeight: 700 }}>{s.val}</span>
                              <span>{s.label}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Chips grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
                        {isProject ? (<>
                          <ChipGroup icon="layers-intersect" label="Tech Stack"   items={item.tech_stack}   color="#0d7377" />
                          <ChipGroup icon="bulb"             label="Key Concepts" items={item.key_concepts} color="#7b5ea7" />
                          <ChipGroup icon="sparkles"         label="Features"     items={item.features}     color="#8b5e3c" />
                          <ChipGroup icon="users"            label="Contributors" items={(item.contributors||[]).map(c=>c.login||c)} color="#7b3f6e" />
                        </>) : (<>
                          <ChipGroup icon="bulb"             label="Main Ideas"    items={item.main_ideas} color="#2e7d6b" maxItems={3} long />
                          <ChipGroup icon="key"              label="Key Terms"     items={item.key_terms}  color="#1a8f7a" />
                          <ChipGroup icon="building"         label="Entities"      items={item.entities}   color="#c97a20" />
                          <ChipGroup icon="message-question" label="Questions"     items={item.questions}  color="#b06a00" maxItems={3} long />
                        </>)}
                      </div>

                      {/* Sentiment arc */}
                      {!isProject && item.sentiment_arc?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                          {item.sentiment_arc.map((s, si) => (
                            <div key={si} style={{ flex: 1, padding: '7px 8px', borderRadius: 8, textAlign: 'center', background: 'rgba(123,74,138,0.08)', border: '1px solid rgba(123,74,138,0.15)' }}>
                              <div style={{ fontSize: 14 }}>{s.emoji}</div>
                              <div style={{ fontSize: 9, color: '#555566', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.section}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', justifyContent: 'space-between', alignItems: 'center' }}>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#444455', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
                          <Icon name="external-link" size={11} />{item.url}
                        </a>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => exportItem(item)} style={actionBtn('#1a8f7a')}>
                            <Icon name="download" size={12} />Export .md
                          </button>
                          <button onClick={() => handleDelete(item)} disabled={isDeleting} style={actionBtn('#e06c5a', true)}>
                            <Icon name="trash" size={12} />{isDeleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ChipGroup({ icon, label, items, color, maxItems = 6, long = false }) {
  if (!items?.length) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <Icon name={icon} size={10} style={{ color }} />
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.slice(0, maxItems).map((item, i) => (
          <span key={i} style={{
            fontSize: 11, padding: long ? '4px 10px' : '3px 8px',
            borderRadius: long ? 6 : 100,
            background: `${color}15`, border: `1px solid ${color}25`,
            color: '#aaaacc', lineHeight: 1.4,
            maxWidth: long ? '100%' : undefined,
          }}>
            {typeof item === 'string' ? item.slice(0, long ? 90 : 40) : String(item).slice(0, 40)}
          </span>
        ))}
      </div>
    </div>
  )
}

const actionBtn = (color, isDanger = false) => ({
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 7,
  border: `1px solid ${color}30`,
  background: `${color}10`, color,
  fontSize: 11, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'Syne, sans-serif', transition: 'all 0.15s',
})

// ── CrawlHUD ──────────────────────────────────────────────────────────────────
function CrawlHUD({ onClose, onResult, profile, defaultPos = { x: 28, y: 28 } }) {
  const [pos, setPos] = useState(defaultPos)
  const [collapsed, setCollapsed] = useState(false)
  const [mode, setMode] = useState('article')
  const [url, setUrl] = useState('')
  const [crawlMode, setCrawlMode] = useState('surface')
  const [useClaude, setUseClaude] = useState(false)
  const [claudeKey, setClaudeKey] = useState('')
  const [folder, setFolder] = useState('Web Clippings')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const hudRef = useRef(null)

  const onMouseDown = useCallback(e => {
    if (e.target.closest('input,button,label,select')) return
    e.preventDefault()
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    const onMove = ev => {
      if (!dragging.current) return
      setPos({ x: dragStart.current.px + (ev.clientX - dragStart.current.mx), y: dragStart.current.py + (ev.clientY - dragStart.current.my) })
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  async function handleSubmit() {
    if (!url) return
    setLoading(true); setError('')
    try {
      let result
      if (mode === 'article') {
        result = await crawlUrl({ url, folder, mode: crawlMode, anthropicKey: useClaude ? claudeKey || undefined : undefined, saveHistory: true })
      } else {
        result = await analyzeProject({ githubUrl: url, saveToObsidian: true, saveHistory: true, anthropicKey: useClaude ? claudeKey || undefined : undefined })
      }
      onResult(result); setUrl('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const accentColor = mode === 'project' ? '#7b5ea7' : '#1a8f7a'

  return (
    <div ref={hudRef} style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: 300, width: collapsed ? 'auto' : 480, background: 'rgba(10,10,18,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: `1px solid rgba(255,255,255,0.09)`, borderTop: `2px solid ${accentColor}`, borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.6)', fontFamily: "'Syne', sans-serif", userSelect: 'none', transition: 'border-top-color 0.2s, width 0.22s' }}>
      <div onMouseDown={onMouseDown} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: collapsed ? '10px 14px' : '13px 16px', cursor: 'grab', borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
        <Icon name="grip-vertical" size={13} style={{ color: '#333344', flexShrink: 0 }} />
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 7, padding: 2, gap: 2 }}>
          {[['article', 'world', 'Article'], ['project', 'brand-github', 'Project']].map(([m, icon, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: 'none', borderRadius: 5, background: mode === m ? 'rgba(255,255,255,0.09)' : 'transparent', color: mode === m ? '#f0eff5' : '#555566', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif', letterSpacing: '0.04em', transition: 'all 0.15s' }}>
              <Icon name={icon} size={11} /> {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCollapsed(c => !c)} style={hudIconBtn}><Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={14} /></button>
        <button onClick={onClose} style={hudIconBtn}><Icon name="x" size={14} /></button>
      </div>
      {!collapsed && (
        <div style={{ padding: '14px 16px 16px' }}>
          <p style={{ fontSize: 12, color: '#555566', margin: '0 0 12px', lineHeight: 1.5 }}>
            {mode === 'article' ? 'Paste any URL — MagPie extracts knowledge and saves it to your vault' : 'Drop any public GitHub URL — tech stack, features, contributors'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={hudInput} type="url" placeholder={mode === 'article' ? 'https://example.com/article' : 'https://github.com/owner/repo'} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus />
            <button onClick={handleSubmit} disabled={loading} style={{ ...hudSubmit, background: accentColor, opacity: loading ? 0.7 : 1 }}>
              {loading ? <span style={spinner} /> : mode === 'article' ? <><Icon name="download" size={12} style={{ marginRight: 5 }} />Crawl</> : <><Icon name="zoom-code" size={12} style={{ marginRight: 5 }} />Analyze</>}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {/* Folder — articles only */}
              {mode === 'article' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="folder" size={12} style={{ color: '#444455' }} />
                  <span style={optText}>Folder</span>
                  <input style={{ ...hudInput, flex: 1, padding: '5px 10px', fontSize: 11 }} value={folder} onChange={e => setFolder(e.target.value)} />
                </div>
              )}

              {/* Depth — articles only */}
              {mode === 'article' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={optText}>Depth</span>
                  {[['surface', 'waves', 'Surface'], ['deep_dive', 'microscope', 'Deep dive']].map(([val, icon, label]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="radio" name="depth" value={val} checked={crawlMode === val} onChange={() => setCrawlMode(val)} style={{ accentColor: '#1a8f7a' }} />
                      <Icon name={icon} size={11} style={{ color: '#8888aa' }} />
                      <span style={optText}>{label}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Claude toggle — both modes */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={useClaude} onChange={e => setUseClaude(e.target.checked)} style={{ accentColor: '#1a8f7a' }} />
                  <Icon name="sparkles" size={12} style={{ color: '#1a8f7a' }} />
                  <span style={{ ...optText, color: '#c8c7d8', fontWeight: 700 }}>Use Claude</span>
                </label>
                <span style={proBadge}>PRO</span>
                {mode === 'project' && useClaude && (
                  <span style={{ fontSize: 10, color: '#444455', marginLeft: 4 }}>adds architecture, tradeoffs, use cases</span>
                )}
              </div>
              {useClaude && <input style={{ ...hudInput, fontSize: 11 }} type="password" placeholder="sk-ant-… your Anthropic key" value={claudeKey} onChange={e => setClaudeKey(e.target.value)} />}
            </div>
          {error && <div style={errorBox}><Icon name="alert-circle" size={12} style={{ marginRight: 6, flexShrink: 0 }} />{error}</div>}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ view, setView, user, status, onSignOut, onShowCrawl }) {
  const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'
  const NAV = [
    { id: 'home',     icon: 'home',           label: 'Home'     },
    { id: 'graph',    icon: 'topology-star',  label: 'Graph'    },
    { id: 'history',  icon: 'clock',          label: 'History'  },
    { id: 'crawls',   icon: 'stack-2',        label: 'Crawls'   },
    { id: 'settings', icon: 'settings',       label: 'Settings' },
  ]
  return (
    <aside style={sidebarStyle}>
      <div style={{ padding: '24px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(26,143,122,0.15)', border: '1px solid rgba(26,143,122,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="feather" size={16} style={{ color: '#1a8f7a' }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#333344', textTransform: 'uppercase' }}>MagPie</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, marginBottom: 28, padding: '0 12px' }}>
        <InitialsAvatar name={user.user_metadata?.full_name} email={user.email} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8888aa', letterSpacing: '0.03em' }}>{firstName}</span>
      </div>
      <button onClick={onShowCrawl} style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center', margin: '0 12px 20px', padding: '9px 0', background: 'rgba(26,143,122,0.12)', border: '1px solid rgba(26,143,122,0.25)', borderRadius: 9, color: '#1a8f7a', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif', width: 'calc(100% - 24px)', letterSpacing: '0.04em', transition: 'background 0.15s' }}>
        <Icon name="plus" size={13} />Crawl
      </button>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', flex: 1 }}>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', border: 'none', borderRadius: 8, background: view === item.id ? 'rgba(255,255,255,0.06)' : 'transparent', color: view === item.id ? '#f0eff5' : '#444455', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif', letterSpacing: '0.05em', textAlign: 'left', width: '100%', transition: 'color 0.15s, background 0.15s' }}>
            <Icon name={item.icon} size={14} style={{ color: view === item.id ? '#1a8f7a' : 'inherit' }} />{item.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: status?.obsidian_connected ? '#1a8f7a' : '#2a2a38' }} />
          <span style={{ fontSize: 10, color: status?.obsidian_connected ? '#1a8f7a' : '#333344', fontWeight: 700, letterSpacing: '0.06em' }}>{status?.obsidian_connected ? 'OBSIDIAN LIVE' : 'OBSIDIAN OFFLINE'}</span>
        </div>
        <button onClick={onSignOut} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#333344', fontSize: 11, cursor: 'pointer', fontFamily: 'Syne, sans-serif', padding: 0 }}>
          <Icon name="logout" size={12} />Log out
        </button>
      </div>
    </aside>
  )
}

function StatsChart({ history }) {
  if (!history.length) return null
  const now = new Date()
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (7 * (7 - i))); return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), articles: 0, projects: 0 } })
  history.forEach(item => { const weeksAgo = Math.floor((now - new Date(item.crawled_at)) / (7 * 24 * 60 * 60 * 1000)); const idx = 7 - weeksAgo; if (idx >= 0 && idx < 8) { if (item.type === 'project') weeks[idx].projects++; else weeks[idx].articles++ } })
  const max = Math.max(...weeks.map(w => w.articles + w.projects), 1)
  const W = 340, H = 120, pad = { l: 6, r: 6, t: 6, b: 22 }
  const barW = (W - pad.l - pad.r) / weeks.length - 4
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      {weeks.map((w, i) => {
        const x = pad.l + i * ((W - pad.l - pad.r) / weeks.length)
        const totalH = ((w.articles + w.projects) / max) * (H - pad.t - pad.b)
        const artH = (w.articles / max) * (H - pad.t - pad.b)
        const projH = (w.projects / max) * (H - pad.t - pad.b)
        const y = H - pad.b - totalH
        return (
          <g key={i}>
            {projH > 0 && <rect x={x} y={y} width={barW} height={projH} fill="#7b5ea7" opacity={0.75} rx={2} />}
            {artH > 0 && <rect x={x} y={y + projH} width={barW} height={artH} fill="#1a8f7a" opacity={0.75} rx={2} />}
            {i % 2 === 0 && <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize={8} fill="#444455">{w.label}</text>}
          </g>
        )
      })}
    </svg>
  )
}

function MiniGraph({ entries }) {
  const ref = useRef(null)
  useEffect(() => { if (entries?.length && ref.current) renderMini() }, [entries])
  async function renderMini() {
    const d3 = await import('d3')
    const svg = d3.select(ref.current); svg.selectAll('*').remove()
    const nodes = [], edges = [], seen = {}, counter = { n: 0 }
    function mkId(p) { return `${p}_${counter.n++}` }
    function leaf(label, type) { const key = `${type}::${label.toLowerCase()}`; if (!seen[key]) { seen[key] = mkId(type); nodes.push({ id: seen[key], type }) }; return seen[key] }
    entries.slice(0, 10).forEach(entry => {
      const rid = mkId('root'); nodes.push({ id: rid, type: entry.type || 'article' })
      ;(entry.links || entry.key_concepts || []).slice(0, 4).forEach(c => edges.push({ source: rid, target: leaf(c, 'concept') }))
      ;(entry.key_terms || []).slice(0, 3).forEach(t => edges.push({ source: rid, target: leaf(t, 'term') }))
    })
    const W = 300, H = 175
    const COLORS = { article: '#1a8f7a', project: '#7b5ea7', concept: '#c97a20', term: '#1a6b8a' }
    const RADII  = { article: 10, project: 12, concept: 5, term: 4 }
    const g = svg.append('g')
    g.append('g').selectAll('line').data(edges).join('line').attr('stroke', 'rgba(255,255,255,0.08)').attr('stroke-width', 1)
    const node = g.append('g').selectAll('circle').data(nodes).join('circle').attr('r', d => RADII[d.type] || 5).attr('fill', d => COLORS[d.type] || '#666').attr('opacity', 0.85)
    d3.forceSimulation(nodes).force('link', d3.forceLink(edges).id(d => d.id).distance(28)).force('charge', d3.forceManyBody().strength(-60)).force('center', d3.forceCenter(W / 2, H / 2)).force('collision', d3.forceCollide().radius(d => (RADII[d.type] || 5) + 4)).on('tick', () => { g.selectAll('line').attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y); node.attr('cx', d => d.x).attr('cy', d => d.y) })
  }
  if (!entries?.length) return <div style={{ width: 300, height: 175, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a38', fontSize: 12 }}>No data yet</div>
  return <svg ref={ref} width={300} height={175} />
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [view, setView] = useState('home')
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [showHUD, setShowHUD] = useState(false)
  const [latestResult, setLatestResult] = useState(null)
  const [obsidianKey, setObsidianKey] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const user = session.user

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    await ensureProfile(user.id).catch(e => console.error('[ensureProfile]', e))
    const [p, crawls] = await Promise.all([getProfile(user.id).catch(() => null), getCrawls(user.id).catch(() => [])])
    setProfile(p); setHistory(crawls)
    if (p?.obsidian_key) setObsidianKey(p.obsidian_key)
    checkStatus().then(setStatus).catch(() => setStatus(null))
  }

  async function handleResult(result) {
    setLatestResult(result)
    if (result.success !== false) {
      try {
        const saved = await saveCrawl(user.id, result)
        setHistory(prev => [saved, ...prev])
      } catch (e) {
        console.error('[handleResult] saveCrawl failed:', e)
        setHistory(prev => [{ ...result, _saveError: true }, ...prev])
      }
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    await upsertProfile(user.id, { obsidian_key: obsidianKey || null })
    setSavingSettings(false); setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  async function handleSignOut() { await signOut(); navigate('/') }

  const articleCount = history.filter(h => h.type === 'article').length
  const projectCount = history.filter(h => h.type === 'project').length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#08080d', fontFamily: "'Syne', sans-serif", color: '#f0eff5' }}>
      <Sidebar view={view} setView={setView} user={user} status={status} onSignOut={handleSignOut} onShowCrawl={() => { setView('graph'); setShowHUD(true) }} />

      <main style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>

        {/* GRAPH */}
        {view === 'graph' && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <GraphView entries={history} />
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 100 }}>
              <button style={graphChrome} onClick={() => { import('d3').then(d3 => { const svgEl = document.querySelector('svg[ref]') || document.querySelector('.graph-svg'); if (svgEl?._zoomBehavior) d3.select(svgEl).transition().duration(400).call(svgEl._zoomBehavior.transform, d3.zoomIdentity) }) }}>
                <Icon name="zoom-reset" size={13} style={{ marginRight: 5 }} />Reset zoom
              </button>
              {!showHUD && (
                <button style={{ ...graphChrome, background: 'rgba(26,143,122,0.15)', border: '1px solid rgba(26,143,122,0.3)', color: '#1a8f7a' }} onClick={() => setShowHUD(true)}>
                  <Icon name="plus" size={13} style={{ marginRight: 5 }} />New crawl
                </button>
              )}
            </div>
            {showHUD && <CrawlHUD onClose={() => setShowHUD(false)} onResult={handleResult} profile={profile} defaultPos={{ x: 28, y: 28 }} />}
          </div>
        )}

        {/* HOME */}
        {view === 'home' && (
          <div style={scrollArea}>
            <div style={pageContent}>
              <h1 style={pageTitle}>Welcome back{(() => { const n = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0]; return n ? `, ${n}` : '' })()}</h1>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
                <button
                  onClick={() => { setView('graph'); setShowHUD(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 32px', background: '#1a8f7a',
                    border: 'none', borderRadius: 12, color: 'white',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'Syne, sans-serif', letterSpacing: '0.02em',
                    boxShadow: '0 0 32px rgba(26,143,122,0.25)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0d6b5a'; e.currentTarget.style.boxShadow = '0 0 48px rgba(26,143,122,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#1a8f7a'; e.currentTarget.style.boxShadow = '0 0 32px rgba(26,143,122,0.25)' }}
                >
                  <Icon name="plus" size={17} />
                  Start crawling
                </button>
              </div>

              <div style={statsRow}>
                {[{ num: articleCount, label: 'Articles', icon: 'file-text' }, { num: projectCount, label: 'Projects', icon: 'brand-github' }, { num: history.length, label: 'Total crawls', icon: 'database' }].map(s => (
                  <div key={s.label} style={statCard}>
                    <div style={{ fontSize: 36, fontFamily: "'Instrument Serif', serif", color: '#1a8f7a', lineHeight: 1 }}>{s.num}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: 6 }}><Icon name={s.icon} size={11} />{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={widgetsRow}>
                <div style={widget} onClick={() => setView('graph')}>
                  <div style={widgetLabel}><Icon name="topology-star" size={11} style={{ marginRight: 5 }} />Recent graph</div>
                  <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}><MiniGraph entries={history} /></div>
                  <div style={{ fontSize: 10, color: '#2a2a38', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}><Icon name="arrows-maximize" size={10} />Click to expand</div>
                </div>
                <div style={widget}>
                  <div style={widgetLabel}><Icon name="chart-bar" size={11} style={{ marginRight: 5 }} />Crawl stats</div>
                  <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}><StatsChart history={history} /></div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                    {[['#1a8f7a', 'Article'], ['#7b5ea7', 'Project']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#444455' }}><div style={{ width: 7, height: 7, borderRadius: 2, background: c }} />{l}</div>
                    ))}
                  </div>
                </div>
              </div>
              {(latestResult || history[0]) && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={11} />Most recent crawl</div>
                  <ResultCard item={latestResult || history[0]} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* HISTORY — upgraded */}
        {view === 'history' && (
          <HistoryFeed
            history={history}
            onDelete={item => setHistory(prev => prev.filter(h => (h.id || h.url) !== (item.id || item.url)))}
            onNewCrawl={() => { setView('graph'); setShowHUD(true) }}
          />
        )}

        {/* CRAWLS */}
        {view === 'crawls' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <CrawlGallery history={history} onDelete={item => setHistory(prev => prev.filter(h => (h.id || h.url) !== (item.id || item.url)))} />
          </div>
        )}

        {/* SETTINGS */}
        {view === 'settings' && (
          <div style={scrollArea}>
            <div style={pageContent}>
              <h2 style={pageHeading}>Settings</h2>
              <div style={settingsCard}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#f0eff5', marginBottom: 6 }}><Icon name="cube" size={14} style={{ color: '#8888aa' }} />Obsidian API key</div>
                  <div style={{ fontSize: 13, color: '#555566', lineHeight: 1.6, marginBottom: 10 }}>From Obsidian → Settings → Local REST API. Enables saving notes to your vault.</div>
                  <input style={settingInput} type="password" value={obsidianKey} onChange={e => setObsidianKey(e.target.value)} placeholder="Paste your Obsidian REST API key" />
                </div>
                <button style={saveBtn} onClick={handleSaveSettings} disabled={savingSettings}>
                  {settingsSaved ? <><Icon name="check" size={13} style={{ marginRight: 5 }} />Saved!</> : savingSettings ? 'Saving…' : <><Icon name="device-floppy" size={13} style={{ marginRight: 5 }} />Save settings</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', color: '#333344', gap: 12 }}>
      <Icon name={icon} size={36} /><span style={{ fontSize: 14 }}>{text}</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sidebarStyle = { width: 190, flexShrink: 0, background: '#0a0a10', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column' }
const scrollArea = { flex: 1, overflowY: 'auto', overflowX: 'hidden' }
const pageContent = { maxWidth: 1080, margin: '0 auto', padding: '48px 52px 60px' }
const pageTitle = { fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(42px, 5vw, 68px)', color: '#f0eff5', marginBottom: 36, letterSpacing: '-0.5px' }
const pageHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }
const pageHeading = { fontFamily: "'Instrument Serif', serif", fontSize: 30, color: '#f0eff5' }
const statsRow = { display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }
const statCard = { flex: 1, minWidth: 140, background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '20px 22px' }
const widgetsRow = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }
const widget = { background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', cursor: 'pointer', minHeight: 230 }
const widgetLabel = { fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center' }
const fabBtn = { display: 'flex', alignItems: 'center', padding: '8px 16px', background: '#1a8f7a', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }
const settingsCard = { background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '32px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 600 }
const settingInput = { width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: '#f0eff5', fontSize: 13, outline: 'none', fontFamily: "'DM Mono', monospace", boxSizing: 'border-box' }
const saveBtn = { display: 'flex', alignItems: 'center', padding: '11px 22px', background: '#1a8f7a', border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'Syne, sans-serif' }
const graphChrome = { display: 'flex', alignItems: 'center', padding: '7px 13px', background: 'rgba(10,10,18,0.75)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#8888aa', fontSize: 12, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700 }
const hudIconBtn = { background: 'none', border: 'none', color: '#444455', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 5, transition: 'color 0.15s' }
const hudInput = { flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f0eff5', fontSize: 13, outline: 'none', fontFamily: "'DM Mono', monospace" }
const hudSubmit = { padding: '9px 16px', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', fontFamily: 'Syne, sans-serif', flexShrink: 0 }
const optText = { fontSize: 11, color: '#666677', userSelect: 'none' }
const proBadge = { fontSize: 10, background: 'rgba(26,143,122,0.12)', color: '#1a8f7a', padding: '2px 7px', borderRadius: 100, fontWeight: 700 }
const errorBox = { marginTop: 10, padding: '8px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 7, fontSize: 11, color: '#e06c5a', display: 'flex', alignItems: 'center' }
const spinner = { width: 13, height: 13, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }