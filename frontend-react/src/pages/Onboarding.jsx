import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { upsertProfile } from '../lib/supabase'

export default function Onboarding({ session }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [obsidianKey, setObsidianKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function finish() {
    setSaving(true)
    setError('')
    try {
      await upsertProfile(session.user.id, {
        obsidian_key: obsidianKey || null,
        default_mode: 'surface',
      })
      navigate('/dashboard')
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div style={page}>
      {/* Progress dots */}
      <div style={progressRow}>
        {[1, 2].map(n => (
          <div key={n} style={{ ...dot, background: step >= n ? '#1a8f7a' : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>

      <div style={card}>
        {step === 1 && (
          <>
            <div style={icon}>🪨</div>
            <h1 style={title}>Connect Obsidian <span style={{ fontStyle: 'italic', color: '#1a8f7a' }}>(optional)</span></h1>
            <p style={subtitle}>
              MagPie saves notes directly to your Obsidian vault. To enable this, install the
              {' '}<a href="https://github.com/coddingtonbear/obsidian-local-rest-api" target="_blank" rel="noreferrer" style={{ color: '#1a8f7a' }}>Local REST API plugin</a>{' '}
              and paste your key below.
            </p>

            <div style={steps}>
              {[
                'Open Obsidian → Settings → Community Plugins',
                'Search "Local REST API" → Install → Enable',
                'Go to Settings → Local REST API → copy your API key',
              ].map((s, i) => (
                <div key={i} style={stepRow}>
                  <div style={stepNum}>{i + 1}</div>
                  <div style={stepText}>{s}</div>
                </div>
              ))}
            </div>

            <input
              style={input}
              type="password"
              placeholder="Paste your Obsidian API key here…"
              value={obsidianKey}
              onChange={e => setObsidianKey(e.target.value)}
            />

            <div style={btnRow}>
              <button style={skipBtn} onClick={() => setStep(2)}>Skip for now</button>
              <button style={nextBtn} onClick={() => setStep(2)}>
                {obsidianKey ? 'Save & continue →' : 'Continue without Obsidian →'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={icon}>✨</div>
            <h1 style={title}>Claude <span style={{ fontStyle: 'italic', color: '#1a8f7a' }}>Pro tier</span></h1>
            <p style={subtitle}>
              MagPie's free tier uses local NLP (spaCy + TextRank) — no API key needed.
              For Claude-powered summaries, paste your Anthropic key. It's used per-request and never stored on our servers.
            </p>

            <div style={tierComparison}>
              <div style={tierCard}>
                <div style={tierTitle}>🌿 Free</div>
                <div style={tierFeature}>✓ TextRank summarization</div>
                <div style={tierFeature}>✓ TF-IDF keywords</div>
                <div style={tierFeature}>✓ spaCy NER entities</div>
                <div style={tierFeature}>✓ Sentiment arc</div>
                <div style={tierFeature}>✓ Co-occurrence graph</div>
                <div style={tierFeature}>✓ Article stats</div>
              </div>
              <div style={{ ...tierCard, borderColor: 'rgba(26,143,122,0.3)', background: 'rgba(26,143,122,0.05)' }}>
                <div style={{ ...tierTitle, color: '#1a8f7a' }}>✨ Claude</div>
                <div style={tierFeature}>✓ Everything in free</div>
                <div style={tierFeature}>✓ Better summaries</div>
                <div style={tierFeature}>✓ Smarter wikilinks</div>
                <div style={tierFeature}>✓ Context-aware tags</div>
                <div style={{ ...tierFeature, color: '#8888aa', fontSize: 11, marginTop: 8 }}>Your key, your cost</div>
              </div>
            </div>

            <input
              style={input}
              type="password"
              placeholder="sk-ant-… (optional, stored encrypted)"
              value={anthropicKey}
              onChange={e => setAnthropicKey(e.target.value)}
            />

            {error && <div style={errorBox}>{error}</div>}

            <div style={btnRow}>
              <button style={skipBtn} onClick={finish} disabled={saving}>Skip for now</button>
              <button style={nextBtn} onClick={finish} disabled={saving}>
                {saving ? 'Saving…' : 'Go to dashboard →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const page = {
  minHeight: '100vh', background: '#0a0a0f',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '40px 16px', fontFamily: "'Syne', sans-serif",
}
const progressRow = { display: 'flex', gap: 8, marginBottom: 32 }
const dot = { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' }
const card = {
  background: '#111118', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 560,
  animation: 'fadeUp 0.4s ease-out',
}
const icon = { fontSize: 40, marginBottom: 16 }
const title = {
  fontFamily: "'Instrument Serif', serif", fontSize: 32,
  color: '#f0eff5', marginBottom: 12, lineHeight: 1.2,
}
const subtitle = { fontSize: 14, color: '#8888aa', lineHeight: 1.7, marginBottom: 28 }
const steps = { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }
const stepRow = { display: 'flex', gap: 12, alignItems: 'flex-start' }
const stepNum = {
  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
  background: 'rgba(26,143,122,0.15)', border: '1px solid rgba(26,143,122,0.3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, color: '#1a8f7a', fontWeight: 700,
}
const stepText = { fontSize: 13, color: '#aaaacc', lineHeight: 1.5, paddingTop: 2 }
const input = {
  width: '100%', padding: '13px 16px', marginBottom: 24,
  background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: '#f0eff5', fontSize: 13,
  fontFamily: "'DM Mono', monospace", outline: 'none',
}
const btnRow = { display: 'flex', gap: 10, justifyContent: 'flex-end' }
const skipBtn = {
  padding: '11px 20px', background: 'transparent',
  border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#8888aa', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const nextBtn = {
  padding: '11px 22px', background: '#1a8f7a',
  border: 'none', borderRadius: 8, color: 'white',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const tierComparison = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }
const tierCard = {
  padding: '20px', borderRadius: 12,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}
const tierTitle = { fontSize: 15, fontWeight: 700, color: '#f0eff5', marginBottom: 12 }
const tierFeature = { fontSize: 12, color: '#8888aa', marginBottom: 6, lineHeight: 1.4 }
const errorBox = {
  padding: '10px 14px', background: 'rgba(192,57,43,0.1)',
  border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8,
  fontSize: 13, color: '#e74c3c', marginBottom: 16,
}