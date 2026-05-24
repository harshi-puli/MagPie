import React, { useState } from 'react'

export default function ResultCard({ item }) {
  const isProject = item.type === 'project'
  const isError = !item.success

  if (isError) {
    return (
      <div style={{ ...card, borderLeft: '4px solid #c97a20', background: 'rgba(201,122,32,0.05)' }}>
        <div style={cardTitle}>{item.title || 'Page'}</div>
        <div style={{ ...cardSummary, color: '#c97a20' }}>{item.summary}</div>
        <div style={{ fontSize: 12, color: '#555566', marginTop: 8 }}>
          💡 Try a direct article URL. Paywalled or nav-only pages won't extract well.
        </div>
      </div>
    )
  }

  const tierBadge = item.tier === 'claude'
    ? <span style={{ ...badge, background: 'rgba(26,143,122,0.15)', color: '#1a8f7a' }}>✨ Claude</span>
    : <span style={{ ...badge, background: 'rgba(255,255,255,0.06)', color: '#8888aa' }}>Free</span>

  const modeBadge = item.mode === 'deep_dive'
    ? <span style={{ ...badge, background: 'rgba(123,94,167,0.15)', color: '#a07dd0' }}>🔬 Deep</span>
    : item.mode === 'surface'
    ? <span style={{ ...badge, background: 'rgba(255,255,255,0.04)', color: '#8888aa' }}>🌊 Surface</span>
    : null

  return (
    <div style={{ ...card, borderLeft: `4px solid ${isProject ? '#7b5ea7' : '#1a8f7a'}` }}>
      <div style={cardHeader}>
        <div style={cardTitle}>{item.title}</div>
        <div style={badgeRow}>
          {tierBadge}
          {modeBadge}
        </div>
      </div>

      <div style={cardSummary}>{item.summary || item.description}</div>

      {/* Tags */}
      {(item.tags || []).length > 0 && (
        <div style={chipRow}>
          {(item.tags || []).map((t, i) => (
            <span key={i} style={tagChip}>{t}</span>
          ))}
        </div>
      )}

      {/* Wikilinks */}
      {(item.links || item.key_concepts || []).length > 0 && (
        <div style={chipRow}>
          {(item.links || item.key_concepts || []).slice(0, 6).map((l, i) => (
            <span key={i} style={linkChip}>[[{l}]]</span>
          ))}
        </div>
      )}

      {/* Project extras */}
      {isProject && (
        <div style={statRow}>
          {item.stars != null && <span style={stat}>⭐ {item.stars?.toLocaleString()}</span>}
          {item.forks != null && <span style={stat}>🍴 {item.forks?.toLocaleString()}</span>}
          {item.sparkline && <span style={{ ...stat, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>{item.sparkline}</span>}
          {item.activity && <span style={{ ...stat, color: item.activity === 'active' ? '#1a8f7a' : '#8888aa' }}>{item.activity}</span>}
        </div>
      )}

      {/* Deep dive extras */}
      {item.mode === 'deep_dive' && item.stats?.reading_level && (
        <div style={statRow}>
          <span style={stat}>📖 {item.stats.reading_level}</span>
          <span style={stat}>⏱ {item.stats.estimated_read_minutes} min</span>
          <span style={stat}>📝 {item.stats.word_count} words</span>
        </div>
      )}

      {/* Vault path */}
      {item.vault_path && !item.vault_path.startsWith('(') && (
        <div style={vaultPath}>📂 {item.vault_path}</div>
      )}
    </div>
  )
}

const card = {
  background: '#111118', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, padding: '20px 24px',
  transition: 'border-color 0.2s',
}
const cardHeader = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }
const cardTitle = { fontFamily: "'Instrument Serif', serif", fontSize: 18, color: '#f0eff5', lineHeight: 1.3 }
const cardSummary = { fontSize: 13, color: '#8888aa', lineHeight: 1.6, marginBottom: 12 }
const badgeRow = { display: 'flex', gap: 6, flexShrink: 0 }
const badge = { fontSize: 10, padding: '2px 8px', borderRadius: 100, fontWeight: 700, letterSpacing: '0.03em', whiteSpace: 'nowrap' }
const chipRow = { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }
const tagChip = { padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 100, fontSize: 11, color: '#8888aa', fontFamily: "'DM Mono', monospace" }
const linkChip = { padding: '2px 8px', background: 'rgba(26,143,122,0.1)', border: '1px solid rgba(26,143,122,0.2)', borderRadius: 100, fontSize: 11, color: '#1a8f7a', fontFamily: "'DM Mono', monospace" }
const statRow = { display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }
const stat = { fontSize: 12, color: '#8888aa' }
const vaultPath = { fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555566', marginTop: 8 }