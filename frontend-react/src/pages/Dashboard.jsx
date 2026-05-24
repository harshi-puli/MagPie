import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut, getProfile, getCrawls, saveCrawl } from '../lib/supabase'
import { crawlUrl, analyzeProject, getGraph, checkStatus } from '../lib/api'
import GraphView from '../components/GraphView'
import ResultCard from '../components/ResultCard'

const TABS = [
  { id: 'crawl',   icon: '🌐', label: 'Article' },
  { id: 'project', icon: '📦', label: 'Project' },
  { id: 'graph',   icon: '🕸',  label: 'Graph' },
  { id: 'history', icon: '📜', label: 'History' },
  { id: 'settings',icon: '⚙️', label: 'Settings' },
]

export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('crawl')
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Crawl state
  const [crawlUrl_, setCrawlUrl] = useState('')
  const [crawlFolder, setCrawlFolder] = useState('Web Clippings')
  const [crawlMode, setCrawlMode] = useState('surface')
  const [useClaude, setUseClaude] = useState(false)
  const [claudeKey, setClaudeKey] = useState('')
  const [saveHistory, setSaveHistory] = useState(true)

  // Project state
  const [projectUrl, setProjectUrl] = useState('')
  const [saveToObsidian, setSaveToObsidian] = useState(true)

  // Settings state
  const [obsidianKey, setObsidianKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    loadProfile()
    loadHistory()
    checkStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  async function loadProfile() {
    const p = await getProfile(session.user.id).catch(() => null)
    setProfile(p)
    if (p?.obsidian_key) setObsidianKey(p.obsidian_key)
    if (p?.anthropic_key) setAnthropicKey(p.anthropic_key)
  }

  async function loadHistory() {
    const crawls = await getCrawls(session.user.id).catch(() => [])
    setHistory(crawls)
  }

  async function handleCrawl() {
    if (!crawlUrl_) return
    setLoading(true); setError('')
    try {
      const result = await crawlUrl({
        url: crawlUrl_,
        folder: crawlFolder || undefined,
        mode: crawlMode,
        anthropicKey: useClaude ? (claudeKey || anthropicKey || undefined) : undefined,
        sessionId: session.user.id,
        saveHistory,
      })
      if (saveHistory) {
        await saveCrawl(session.user.id, result).catch(() => {})
        await loadHistory()
      }
      setHistory(prev => [result, ...prev])
      setCrawlUrl('')
      setTab('history')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleProject() {
    if (!projectUrl) return
    setLoading(true); setError('')
    try {
      const result = await analyzeProject({
        githubUrl: projectUrl,
        sessionId: session.user.id,
        saveToObsidian,
        saveHistory,
      })
      if (saveHistory) {
        await saveCrawl(session.user.id, result).catch(() => {})
        await loadHistory()
      }
      setHistory(prev => [result, ...prev])
      setProjectUrl('')
      setTab('history')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    const { upsertProfile } = await import('../lib/supabase')
    await upsertProfile(session.user.id, {
      obsidian_key: obsidianKey || null,
      anthropic_key: anthropicKey || null,
    })
    setSavingSettings(false)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const user = session.user
  const initials = user.email?.[0]?.toUpperCase() || '?'

  return (
    <div style={layout}>
      {/* SIDEBAR */}
      <aside style={sidebar}>
        <div style={sidebarTop}>
          <div style={sidebarLogo}>
            <span style={{ fontSize: 20, animation: 'bob 3s ease-in-out infinite', display: 'inline-block' }}>🐦‍⬛</span>
            <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, color: '#f0eff5' }}>MagPie</span>
          </div>

          {/* Status indicator */}
          <div style={statusPill}>
            <div style={{ ...statusDot, background: status?.obsidian_connected ? '#1a8f7a' : '#555566', animation: status?.obsidian_connected ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 11, color: status?.obsidian_connected ? '#1a8f7a' : '#555566', fontWeight: 700 }}>
              {status?.obsidian_connected ? 'Obsidian live' : 'Obsidian offline'}
            </span>
          </div>

          {/* Nav */}
          <nav style={sidebarNav}>
            {TABS.map(t => (
              <button key={t.id} style={{ ...navBtn, ...(tab === t.id ? navBtnActive : {}) }} onClick={() => setTab(t.id)}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* User */}
        <div style={userRow}>
          <div style={avatar}>{initials}</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 12, color: '#f0eff5', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.user_metadata?.full_name || user.email}
            </div>
            <button style={signOutBtn} onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={mainArea}>

        {/* ── ARTICLE TAB ── */}
        {tab === 'crawl' && (
          <div style={tabContent}>
            <div style={tabHeader}>
              <h1 style={tabTitle}>Crawl an article</h1>
              <p style={tabSub}>Paste any URL — MagPie extracts knowledge and saves it to your vault</p>
            </div>

            <div style={inputBox}>
              <div style={inputRow}>
                <input
                  style={mainInput}
                  type="url"
                  placeholder="https://example.com/article"
                  value={crawlUrl_}
                  onChange={e => setCrawlUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCrawl()}
                />
                <button style={{ ...goBtn, opacity: loading ? 0.7 : 1 }} onClick={handleCrawl} disabled={loading}>
                  {loading ? <span className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} /> : 'Crawl'}
                </button>
              </div>

              <div style={optionsRow}>
                <label style={optLabel}><input type="checkbox" checked={saveHistory} onChange={e => setSaveHistory(e.target.checked)} /> Save to history</label>
                <label style={optLabel}>Folder: <input style={smallInput} value={crawlFolder} onChange={e => setCrawlFolder(e.target.value)} placeholder="Web Clippings" /></label>
              </div>

              <div style={modeRow}>
                <span style={modeLabel}>Obsidian note depth:</span>
                <label style={optLabel}>
                  <input type="radio" name="mode" value="surface" checked={crawlMode === 'surface'} onChange={() => setCrawlMode('surface')} />
                  🌊 <strong>Surface</strong> <span style={{ fontSize: 11, color: '#8888aa' }}>— summary + tags + wikilinks</span>
                </label>
                <label style={optLabel}>
                  <input type="radio" name="mode" value="deep_dive" checked={crawlMode === 'deep_dive'} onChange={() => setCrawlMode('deep_dive')} />
                  🔬 <strong>Deep Dive</strong> <span style={{ fontSize: 11, color: '#8888aa' }}>— + key terms, ideas, questions, sentiment, stats</span>
                </label>
              </div>

              <div style={claudeToggleRow}>
                <label style={{ ...optLabel, fontWeight: 700, color: '#f0eff5' }}>
                  <input type="checkbox" checked={useClaude} onChange={e => setUseClaude(e.target.checked)} />
                  ✨ Use Claude for better summaries
                </label>
                <span style={proBadge}>PRO</span>
              </div>
              {useClaude && (
                <input
                  style={{ ...mainInput, fontSize: 12, marginTop: 8 }}
                  type="password"
                  placeholder="sk-ant-… (your Anthropic key, used once, never stored)"
                  value={claudeKey}
                  onChange={e => setClaudeKey(e.target.value)}
                />
              )}
            </div>

            {error && <div style={errorBox}>{error}</div>}
          </div>
        )}

        {/* ── PROJECT TAB ── */}
        {tab === 'project' && (
          <div style={tabContent}>
            <div style={tabHeader}>
              <h1 style={tabTitle}>Analyze a GitHub repo</h1>
              <p style={tabSub}>Drop any public GitHub URL — get tech stack, features, structure, contributors, free</p>
            </div>

            <div style={inputBox}>
              <div style={inputRow}>
                <input
                  style={{ ...mainInput, fontFamily: "'DM Mono', monospace" }}
                  type="url"
                  placeholder="https://github.com/owner/repo"
                  value={projectUrl}
                  onChange={e => setProjectUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProject()}
                />
                <button style={{ ...goBtn, background: '#7b5ea7', opacity: loading ? 0.7 : 1 }} onClick={handleProject} disabled={loading}>
                  {loading ? <span className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} /> : 'Analyze'}
                </button>
              </div>

              <div style={optionsRow}>
                <label style={optLabel}><input type="checkbox" checked={saveHistory} onChange={e => setSaveHistory(e.target.checked)} /> Save to history</label>
                <label style={optLabel}><input type="checkbox" checked={saveToObsidian} onChange={e => setSaveToObsidian(e.target.checked)} /> Save to Obsidian</label>
              </div>
            </div>

            {error && <div style={errorBox}>{error}</div>}
          </div>
        )}

        {/* ── GRAPH TAB ── */}
        {tab === 'graph' && (
          <div style={{ ...tabContent, height: '100%' }}>
            <div style={tabHeader}>
              <h1 style={tabTitle}>Knowledge graph</h1>
              <p style={tabSub}>Your crawled articles and projects, connected by shared concepts</p>
            </div>
            <GraphView entries={history} />
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div style={tabContent}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h1 style={tabTitle}>History</h1>
                <p style={tabSub}>{history.length} items crawled</p>
              </div>
            </div>
            {history.length === 0 ? (
              <div style={emptyState}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🪶</div>
                <div>Nothing crawled yet — paste a URL in the Article tab to get started</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {history.map((item, i) => <ResultCard key={item.id || i} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div style={tabContent}>
            <div style={tabHeader}>
              <h1 style={tabTitle}>Settings</h1>
              <p style={tabSub}>Manage your API keys and preferences</p>
            </div>

            <div style={settingsCard}>
              <div style={settingsSection}>
                <div style={settingsLabel}>🪨 Obsidian API Key</div>
                <div style={settingsDesc}>From Obsidian → Settings → Local REST API. Leave blank if not using Obsidian.</div>
                <input style={settingsInput} type="password" value={obsidianKey} onChange={e => setObsidianKey(e.target.value)} placeholder="Paste your Obsidian REST API key" />
              </div>

              <div style={settingsSection}>
                <div style={settingsLabel}>✨ Anthropic API Key <span style={proBadge}>PRO</span></div>
                <div style={settingsDesc}>Your own Anthropic key for Claude-powered summaries. Used per-request, never logged.</div>
                <input style={settingsInput} type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-…" />
              </div>

              <button style={saveBtn} onClick={handleSaveSettings} disabled={savingSettings}>
                {settingsSaved ? '✓ Saved!' : savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const layout = { display: 'flex', height: '100vh', background: '#0d0d14', fontFamily: "'Syne', sans-serif", overflow: 'hidden' }

const sidebar = {
  width: 220, flexShrink: 0, background: '#0a0a0f',
  borderRight: '1px solid rgba(255,255,255,0.06)',
  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
  padding: '24px 0',
}
const sidebarTop = { display: 'flex', flexDirection: 'column', gap: 0 }
const sidebarLogo = { display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', marginBottom: 20 }
const statusPill = { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px', marginBottom: 8 }
const statusDot = { width: 7, height: 7, borderRadius: '50%' }
const sidebarNav = { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' }
const navBtn = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
  background: 'none', border: 'none', borderRadius: 8, color: '#8888aa',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left',
  transition: 'all 0.15s',
}
const navBtnActive = { background: 'rgba(26,143,122,0.12)', color: '#1a8f7a' }
const userRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }
const avatar = {
  width: 32, height: 32, borderRadius: '50%', background: 'rgba(26,143,122,0.2)',
  border: '1.5px solid rgba(26,143,122,0.3)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 13, color: '#1a8f7a', fontWeight: 700, flexShrink: 0,
}
const signOutBtn = {
  background: 'none', border: 'none', color: '#555566', fontSize: 11,
  cursor: 'pointer', padding: 0, fontFamily: "'Syne', sans-serif",
}

const mainArea = { flex: 1, overflow: 'auto', background: '#0d0d14' }
const tabContent = { maxWidth: 860, margin: '0 auto', padding: '48px 32px' }
const tabHeader = { marginBottom: 32 }
const tabTitle = { fontFamily: "'Instrument Serif', serif", fontSize: 32, color: '#f0eff5', marginBottom: 6 }
const tabSub = { fontSize: 14, color: '#8888aa' }

const inputBox = {
  background: '#111118', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16, padding: '24px',
}
const inputRow = { display: 'flex', gap: 10, marginBottom: 14 }
const mainInput = {
  flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
  border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 10,
  color: '#f0eff5', fontSize: 14, outline: 'none', transition: 'border-color 0.2s',
}
const goBtn = {
  padding: '12px 24px', background: '#1a8f7a', border: 'none',
  borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
}
const optionsRow = { display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }
const optLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#8888aa', cursor: 'pointer' }
const smallInput = {
  padding: '5px 10px', background: 'rgba(255,255,255,0.04)',
  border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 6,
  color: '#f0eff5', fontSize: 12, outline: 'none', width: 160,
  fontFamily: "'DM Mono', monospace",
}
const modeRow = { display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 0 }
const modeLabel = { fontSize: 13, fontWeight: 700, color: '#f0eff5' }
const claudeToggleRow = { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }
const proBadge = { fontSize: 10, background: 'rgba(26,143,122,0.15)', color: '#1a8f7a', padding: '2px 8px', borderRadius: 100, fontWeight: 700, letterSpacing: '0.05em' }

const errorBox = { marginTop: 12, padding: '10px 14px', background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, fontSize: 13, color: '#e74c3c' }
const emptyState = { textAlign: 'center', padding: '64px 32px', color: '#8888aa', fontSize: 14 }

const settingsCard = { background: '#111118', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '32px', display: 'flex', flexDirection: 'column', gap: 28 }
const settingsSection = { display: 'flex', flexDirection: 'column', gap: 8 }
const settingsLabel = { fontSize: 15, fontWeight: 700, color: '#f0eff5', display: 'flex', alignItems: 'center', gap: 8 }
const settingsDesc = { fontSize: 13, color: '#8888aa', lineHeight: 1.6 }
const settingsInput = { padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f0eff5', fontSize: 13, outline: 'none', fontFamily: "'DM Mono', monospace" }
const saveBtn = { padding: '12px 24px', background: '#1a8f7a', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }