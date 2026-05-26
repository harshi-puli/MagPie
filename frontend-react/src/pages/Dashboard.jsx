import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut, getProfile, getCrawls, saveCrawl, upsertProfile, ensureProfile } from '../lib/supabase'
import { crawlUrl, analyzeProject, checkStatus } from '../lib/api'
import GraphView from '../components/GraphView'
import ResultCard from '../components/ResultCard'

// ── Icon helper (Tabler outline webfont) ──────────────────────────────────────
function Icon({ name, size = 15, style = {} }) {
  return <i className={`ti ti-${name}`} aria-hidden="true" style={{ fontSize: size, lineHeight: 1, ...style }} />
}

// ── Initials avatar ───────────────────────────────────────────────────────────
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
    }}>
      {initials}
    </div>
  )
}

// ── Draggable + collapsible crawl HUD ────────────────────────────────────────
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

  // Drag handlers
  const onMouseDown = useCallback(e => {
    if (e.target.closest('input,button,label,select')) return
    e.preventDefault()
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }

    const onMove = ev => {
      if (!dragging.current) return
      const dx = ev.clientX - dragStart.current.mx
      const dy = ev.clientY - dragStart.current.my
      setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
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
        result = await analyzeProject({ githubUrl: url, saveToObsidian: true, saveHistory: true })
      }
      onResult(result)
      setUrl('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const accentColor = mode === 'project' ? '#7b5ea7' : '#1a8f7a'

  return (
    <div
      ref={hudRef}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        zIndex: 300,
        width: collapsed ? 'auto' : 480,
        background: 'rgba(10,10,18,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid rgba(255,255,255,0.09)`,
        borderTop: `2px solid ${accentColor}`,
        borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        fontFamily: "'Syne', sans-serif",
        userSelect: 'none',
        transition: 'border-top-color 0.2s, width 0.22s',
      }}
    >
      {/* ── Header / drag handle ── */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: collapsed ? '10px 14px' : '13px 16px',
          cursor: 'grab',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Icon name="grip-vertical" size={13} style={{ color: '#333344', flexShrink: 0 }} />

        {/* Mode toggle — compact pill */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 7, padding: 2, gap: 2 }}>
          {[['article', 'world', 'Article'], ['project', 'brand-github', 'Project']].map(([m, icon, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', border: 'none', borderRadius: 5,
                background: mode === m ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: mode === m ? '#f0eff5' : '#555566',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}
            >
              <Icon name={icon} size={11} /> {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Collapse */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={hudIconBtn}
        >
          <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={14} />
        </button>

        {/* Close */}
        <button onClick={onClose} title="Close" style={hudIconBtn}>
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* ── Body (hidden when collapsed) ── */}
      {!collapsed && (
        <div style={{ padding: '14px 16px 16px' }}>
          <p style={{ fontSize: 12, color: '#555566', margin: '0 0 12px', lineHeight: 1.5 }}>
            {mode === 'article'
              ? 'Paste any URL — MagPie extracts knowledge and saves it to your vault'
              : 'Drop any public GitHub URL — tech stack, features, contributors'}
          </p>

          {/* URL + submit */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={hudInput}
              type="url"
              placeholder={mode === 'article' ? 'https://example.com/article' : 'https://github.com/owner/repo'}
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                ...hudSubmit,
                background: accentColor,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? <span style={spinner} />
                : mode === 'article'
                  ? <><Icon name="download" size={12} style={{ marginRight: 5 }} />Crawl</>
                  : <><Icon name="zoom-code" size={12} style={{ marginRight: 5 }} />Analyze</>
              }
            </button>
          </div>

          {/* Article-only options */}
          {mode === 'article' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {/* Folder */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="folder" size={12} style={{ color: '#444455' }} />
                <span style={optText}>Folder</span>
                <input
                  style={{ ...hudInput, flex: 1, padding: '5px 10px', fontSize: 11 }}
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                />
              </div>

              {/* Depth */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={optText}>Depth</span>
                {[['surface', 'waves', 'Surface'], ['deep_dive', 'microscope', 'Deep dive']].map(([val, icon, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input
                      type="radio" name="depth" value={val}
                      checked={crawlMode === val}
                      onChange={() => setCrawlMode(val)}
                      style={{ accentColor: '#1a8f7a' }}
                    />
                    <Icon name={icon} size={11} style={{ color: '#8888aa' }} />
                    <span style={optText}>{label}</span>
                  </label>
                ))}
              </div>

              {/* Claude toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={useClaude}
                    onChange={e => setUseClaude(e.target.checked)}
                    style={{ accentColor: '#1a8f7a' }}
                  />
                  <Icon name="sparkles" size={12} style={{ color: '#1a8f7a' }} />
                  <span style={{ ...optText, color: '#c8c7d8', fontWeight: 700 }}>Use Claude</span>
                </label>
                <span style={proBadge}>PRO</span>
              </div>

              {useClaude && (
                <input
                  style={{ ...hudInput, fontSize: 11 }}
                  type="password"
                  placeholder="sk-ant-… your Anthropic key"
                  value={claudeKey}
                  onChange={e => setClaudeKey(e.target.value)}
                />
              )}
            </div>
          )}

          {error && (
            <div style={errorBox}>
              <Icon name="alert-circle" size={12} style={{ marginRight: 6, flexShrink: 0 }} />
              {error}
            </div>
          )}
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
      {/* Logo mark */}
      <div style={{ padding: '24px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(26,143,122,0.15)', border: '1px solid rgba(26,143,122,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="feather" size={16} style={{ color: '#1a8f7a' }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#333344', textTransform: 'uppercase' }}>MagPie</span>
      </div>

      {/* Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, marginBottom: 28, padding: '0 12px' }}>
        <InitialsAvatar name={user.user_metadata?.full_name} email={user.email} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8888aa', letterSpacing: '0.03em' }}>{firstName}</span>
      </div>

      {/* New crawl button */}
      <button
        onClick={onShowCrawl}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
          margin: '0 12px 20px', padding: '9px 0',
          background: 'rgba(26,143,122,0.12)', border: '1px solid rgba(26,143,122,0.25)',
          borderRadius: 9, color: '#1a8f7a', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'Syne, sans-serif', width: 'calc(100% - 24px)',
          letterSpacing: '0.04em', transition: 'background 0.15s',
        }}
      >
        <Icon name="plus" size={13} />Crawl
      </button>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', flex: 1 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '10px 12px', border: 'none', borderRadius: 8,
              background: view === item.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: view === item.id ? '#f0eff5' : '#444455',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'Syne, sans-serif', letterSpacing: '0.05em',
              textAlign: 'left', width: '100%',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            <Icon name={item.icon} size={14} style={{ color: view === item.id ? '#1a8f7a' : 'inherit' }} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Status + sign out */}
      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: status?.obsidian_connected ? '#1a8f7a' : '#2a2a38' }} />
          <span style={{ fontSize: 10, color: status?.obsidian_connected ? '#1a8f7a' : '#333344', fontWeight: 700, letterSpacing: '0.06em' }}>
            {status?.obsidian_connected ? 'OBSIDIAN LIVE' : 'OBSIDIAN OFFLINE'}
          </span>
        </div>
        <button
          onClick={onSignOut}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#333344', fontSize: 11, cursor: 'pointer', fontFamily: 'Syne, sans-serif', padding: 0 }}
        >
          <Icon name="logout" size={12} />Log out
        </button>
      </div>
    </aside>
  )
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function StatsChart({ history }) {
  if (!history.length) return null
  const now = new Date()
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (7 * (7 - i)))
    return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), articles: 0, projects: 0 }
  })
  history.forEach(item => {
    const weeksAgo = Math.floor((now - new Date(item.crawled_at)) / (7 * 24 * 60 * 60 * 1000))
    const idx = 7 - weeksAgo
    if (idx >= 0 && idx < 8) { if (item.type === 'project') weeks[idx].projects++; else weeks[idx].articles++ }
  })
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

// ── Mini graph preview ────────────────────────────────────────────────────────
function MiniGraph({ entries }) {
  const ref = useRef(null)
  useEffect(() => { if (entries?.length && ref.current) renderMini() }, [entries])

  async function renderMini() {
    const d3 = await import('d3')
    const svg = d3.select(ref.current); svg.selectAll('*').remove()
    const nodes = [], edges = [], seen = {}, counter = { n: 0 }
    function mkId(p) { return `${p}_${counter.n++}` }
    function leaf(label, type) {
      const key = `${type}::${label.toLowerCase()}`
      if (!seen[key]) { seen[key] = mkId(type); nodes.push({ id: seen[key], type }) }
      return seen[key]
    }
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
    const node = g.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', d => RADII[d.type] || 5).attr('fill', d => COLORS[d.type] || '#666').attr('opacity', 0.85)
    d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(28))
      .force('charge', d3.forceManyBody().strength(-60))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (RADII[d.type] || 5) + 4))
      .on('tick', () => {
        g.selectAll('line').attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('cx', d => d.x).attr('cy', d => d.y)
      })
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
  const [showHUD, setShowHUD] = useState(false)  // crawl HUD on graph
  const [latestResult, setLatestResult] = useState(null)
  const [obsidianKey, setObsidianKey] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const user = session.user

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    // ensureProfile FIRST — creates the profiles row if missing,
    // which is required by the crawls foreign key constraint.
    await ensureProfile(user.id).catch(e => console.error('[ensureProfile]', e))

    const [p, crawls] = await Promise.all([
      getProfile(user.id).catch(() => null),
      getCrawls(user.id).catch(() => []),
    ])
    setProfile(p); setHistory(crawls)
    if (p?.obsidian_key) setObsidianKey(p.obsidian_key)
    checkStatus().then(setStatus).catch(() => setStatus(null))
  }

  async function handleResult(result) {
    setLatestResult(result)
    if (result.success !== false) {
      try {
        const saved = await saveCrawl(user.id, result)
        // Use DB row (has a real id) so future deletes/updates work
        setHistory(prev => [saved, ...prev])
      } catch (e) {
        console.error('[handleResult] saveCrawl failed:', e)
        // Still show in UI for this session
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
      <Sidebar
        view={view} setView={setView}
        user={user} status={status}
        onSignOut={handleSignOut}
        onShowCrawl={() => { setView('graph'); setShowHUD(true) }}
      />

      <main style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>

        {/* ── GRAPH (default, full canvas) ── */}
        {view === 'graph' && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* GraphView fills entire area */}
            <GraphView entries={history} />

            {/* Floating "zoom reset" top-right */}
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 100 }}>
              <button
                style={graphChrome}
                onClick={() => {
                  import('d3').then(d3 => {
                    const svgEl = document.querySelector('svg[ref]') || document.querySelector('.graph-svg')
                    if (svgEl?._zoomBehavior) d3.select(svgEl).transition().duration(400).call(svgEl._zoomBehavior.transform, d3.zoomIdentity)
                  })
                }}
              >
                <Icon name="zoom-reset" size={13} style={{ marginRight: 5 }} />Reset zoom
              </button>
              {!showHUD && (
                <button
                  style={{ ...graphChrome, background: 'rgba(26,143,122,0.15)', border: '1px solid rgba(26,143,122,0.3)', color: '#1a8f7a' }}
                  onClick={() => setShowHUD(true)}
                >
                  <Icon name="plus" size={13} style={{ marginRight: 5 }} />New crawl
                </button>
              )}
            </div>

            {/* Draggable crawl HUD */}
            {showHUD && (
              <CrawlHUD
                onClose={() => setShowHUD(false)}
                onResult={handleResult}
                profile={profile}
                defaultPos={{ x: 28, y: 28 }}
              />
            )}
          </div>
        )}

        {/* ── HOME / overview ── */}
        {view === 'home' && (
          <div style={scrollArea}>
            <div style={pageContent}>
              <h1 style={pageTitle}>
                Welcome back{(() => { const n = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0]; return n ? `, ${n}` : '' })()}
              </h1>

              <div style={statsRow}>
                {[
                  { num: articleCount, label: 'Articles', icon: 'file-text' },
                  { num: projectCount, label: 'Projects', icon: 'brand-github' },
                  { num: history.length, label: 'Total crawls', icon: 'database' },
                ].map(s => (
                  <div key={s.label} style={statCard}>
                    <div style={{ fontSize: 36, fontFamily: "'Instrument Serif', serif", color: '#1a8f7a', lineHeight: 1 }}>{s.num}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: 6 }}>
                      <Icon name={s.icon} size={11} />{s.label}
                    </div>
                  </div>
                ))}
              </div>

              <div style={widgetsRow}>
                <div style={widget} onClick={() => setView('graph')}>
                  <div style={widgetLabel}><Icon name="topology-star" size={11} style={{ marginRight: 5 }} />Recent graph</div>
                  <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}><MiniGraph entries={history} /></div>
                  <div style={{ fontSize: 10, color: '#2a2a38', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                    <Icon name="arrows-maximize" size={10} />Click to expand
                  </div>
                </div>
                <div style={widget}>
                  <div style={widgetLabel}><Icon name="chart-bar" size={11} style={{ marginRight: 5 }} />Crawl stats</div>
                  <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}><StatsChart history={history} /></div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                    {[['#1a8f7a', 'Article'], ['#7b5ea7', 'Project']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#444455' }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: c }} />{l}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {(latestResult || history[0]) && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={11} />Most recent crawl
                  </div>
                  <ResultCard item={latestResult || history[0]} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
        {view === 'history' && (
          <div style={scrollArea}>
            <div style={pageContent}>
              <div style={pageHeader}>
                <h2 style={pageHeading}>History <span style={{ fontSize: 14, color: '#444455', fontWeight: 400 }}>{history.length} items</span></h2>
                <button style={fabBtn} onClick={() => { setView('graph'); setShowHUD(true) }}>
                  <Icon name="plus" size={13} style={{ marginRight: 5 }} />New crawl
                </button>
              </div>
              {history.length === 0
                ? <EmptyState icon="clock" text="Nothing crawled yet — start on the Graph view" />
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {history.map((item, i) => <ResultCard key={item.id || i} item={item} />)}
                  </div>
              }
            </div>
          </div>
        )}

        {/* ── CRAWLS ── */}
        {view === 'crawls' && (
          <div style={scrollArea}>
            <div style={pageContent}>
              <div style={pageHeader}>
                <h2 style={pageHeading}>Articles</h2>
              </div>
              {history.filter(h => h.type === 'article').length === 0
                ? <EmptyState icon="world" text="No articles crawled yet" />
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {history.filter(h => h.type === 'article').map((item, i) => <ResultCard key={item.id || i} item={item} />)}
                  </div>
              }
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {view === 'settings' && (
          <div style={scrollArea}>
            <div style={pageContent}>
              <h2 style={pageHeading}>Settings</h2>
              <div style={settingsCard}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#f0eff5', marginBottom: 6 }}>
                    <Icon name="cube" size={14} style={{ color: '#8888aa' }} />Obsidian API key
                  </div>
                  <div style={{ fontSize: 13, color: '#555566', lineHeight: 1.6, marginBottom: 10 }}>
                    From Obsidian → Settings → Local REST API. Enables saving notes to your vault.
                  </div>
                  <input
                    style={settingInput}
                    type="password"
                    value={obsidianKey}
                    onChange={e => setObsidianKey(e.target.value)}
                    placeholder="Paste your Obsidian REST API key"
                  />
                </div>
                <button style={saveBtn} onClick={handleSaveSettings} disabled={savingSettings}>
                  {settingsSaved
                    ? <><Icon name="check" size={13} style={{ marginRight: 5 }} />Saved!</>
                    : savingSettings ? 'Saving…'
                    : <><Icon name="device-floppy" size={13} style={{ marginRight: 5 }} />Save settings</>}
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
      <Icon name={icon} size={36} />
      <span style={{ fontSize: 14 }}>{text}</span>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const sidebarStyle = {
  width: 190, flexShrink: 0,
  background: '#0a0a10',
  borderRight: '1px solid rgba(255,255,255,0.04)',
  display: 'flex', flexDirection: 'column',
}

const scrollArea = { flex: 1, overflowY: 'auto', overflowX: 'hidden' }
const pageContent = { maxWidth: 1080, margin: '0 auto', padding: '48px 52px 60px' }
const pageTitle = { fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(42px, 5vw, 68px)', color: '#f0eff5', marginBottom: 36, letterSpacing: '-0.5px' }
const pageHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }
const pageHeading = { fontFamily: "'Instrument Serif', serif", fontSize: 30, color: '#f0eff5' }
const statsRow = { display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }
const statCard = {
  flex: 1, minWidth: 140,
  background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 12, padding: '20px 22px',
}
const widgetsRow = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }
const widget = {
  background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column',
  cursor: 'pointer', minHeight: 230,
}
const widgetLabel = { fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center' }
const fabBtn = {
  display: 'flex', alignItems: 'center',
  padding: '8px 16px', background: '#1a8f7a', border: 'none',
  borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'Syne, sans-serif',
}
const settingsCard = {
  background: '#0e0e16', border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16, padding: '32px', display: 'flex', flexDirection: 'column',
  gap: 22, maxWidth: 600,
}
const settingInput = {
  width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9,
  color: '#f0eff5', fontSize: 13, outline: 'none',
  fontFamily: "'DM Mono', monospace", boxSizing: 'border-box',
}
const saveBtn = {
  display: 'flex', alignItems: 'center',
  padding: '11px 22px', background: '#1a8f7a', border: 'none',
  borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'Syne, sans-serif',
}

// Graph chrome buttons (top-right of graph)
const graphChrome = {
  display: 'flex', alignItems: 'center',
  padding: '7px 13px', background: 'rgba(10,10,18,0.75)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
  color: '#8888aa', fontSize: 12, cursor: 'pointer',
  fontFamily: 'Syne, sans-serif', fontWeight: 700,
}

// HUD styles
const hudIconBtn = {
  background: 'none', border: 'none', color: '#444455',
  cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
  borderRadius: 5, transition: 'color 0.15s',
}
const hudInput = {
  flex: 1, padding: '9px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: '#f0eff5', fontSize: 13,
  outline: 'none', fontFamily: "'DM Mono', monospace",
}
const hudSubmit = {
  padding: '9px 16px', border: 'none', borderRadius: 8,
  color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  whiteSpace: 'nowrap', display: 'flex', alignItems: 'center',
  fontFamily: 'Syne, sans-serif', flexShrink: 0,
}
const optText = { fontSize: 11, color: '#666677', userSelect: 'none' }
const proBadge = {
  fontSize: 10, background: 'rgba(26,143,122,0.12)', color: '#1a8f7a',
  padding: '2px 7px', borderRadius: 100, fontWeight: 700,
}
const errorBox = {
  marginTop: 10, padding: '8px 12px',
  background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)',
  borderRadius: 7, fontSize: 11, color: '#e06c5a',
  display: 'flex', alignItems: 'center',
}
const spinner = {
  width: 13, height: 13, border: '2px solid rgba(255,255,255,0.25)',
  borderTopColor: 'white', borderRadius: '50%', display: 'inline-block',
  animation: 'spin 0.7s linear infinite',
}