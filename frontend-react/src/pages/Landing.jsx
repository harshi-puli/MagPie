import React, { useState } from 'react'
import AuthModal from '../components/AuthModal'

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
  navLogo: {
    display: 'flex', alignItems: 'baseline', gap: 8,
  },
  navBird: {
    fontSize: 22, display: 'inline-block',
    animation: 'bob 3s ease-in-out infinite',
  },
  navName: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: 22, color: '#f0eff5',
  },
  navLinks: {
    display: 'flex', alignItems: 'center', gap: 32,
  },
  navLink: {
    fontSize: 13, color: '#8888aa', fontWeight: 600,
    letterSpacing: '0.03em', cursor: 'pointer', transition: 'color 0.2s',
    background: 'none', border: 'none', padding: 0,
  },
  navCta: {
    padding: '9px 22px', background: '#1a8f7a', color: 'white',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
    letterSpacing: '0.03em', cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // ── HERO ──
  hero: {
    paddingTop: 160, paddingBottom: 120,
    textAlign: 'center', maxWidth: 820, margin: '0 auto',
    padding: '160px 32px 120px',
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

  // ── VIDEO PLACEHOLDER ──
  videoSection: {
    maxWidth: 1000, margin: '0 auto', padding: '0 32px 120px',
  },
  videoWrap: {
    borderRadius: 20, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    background: '#111118',
    aspectRatio: '16/9',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    position: 'relative',
  },
  videoGlow: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at 50% 0%, rgba(26,143,122,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  playBtn: {
    width: 72, height: 72, borderRadius: '50%',
    background: 'rgba(26,143,122,0.2)', border: '2px solid rgba(26,143,122,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, cursor: 'pointer', zIndex: 1,
    transition: 'all 0.2s',
  },
  videoLabel: {
    color: '#8888aa', fontSize: 14, zIndex: 1,
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
  featureTitle: {
    fontSize: 18, fontWeight: 700, color: '#f0eff5', marginBottom: 10,
  },
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
  },
  footerText: { fontSize: 13, color: '#555566' },
}

const FEATURES = [
  {
    icon: '🕸',
    title: 'Knowledge Graph',
    desc: 'Every article you save becomes a node in your personal knowledge graph. Shared concepts create connections automatically — no manual linking required.',
  },
  {
    icon: '🔬',
    title: 'Deep NLP Analysis',
    desc: 'Free tier includes TextRank summarization, TF-IDF keywords, co-occurrence graphs, sentiment arc, readability stats, and named entity recognition.',
  },
  {
    icon: '📦',
    title: 'GitHub Project Mode',
    desc: 'Drop any GitHub URL and get an instant structured breakdown — tech stack, features, file structure, contributors, and commit activity.',
  },
  {
    icon: '🪨',
    title: 'Obsidian Native',
    desc: 'Notes saved directly to your vault with [[wikilinks]] woven in. Works via a local REST API plugin — your data never leaves your machine.',
  },
  {
    icon: '✨',
    title: 'Claude Pro Tier',
    desc: 'Bring your own Anthropic key for Claude-powered summaries. Better quality, smarter wikilinks, and "go deeper" Q&A on any content.',
  },
  {
    icon: '🔒',
    title: 'Your Keys, Your Data',
    desc: 'MagPie never stores your API keys on its servers. Keys are used per-request and never logged. Your vault stays on your machine.',
  },
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

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false)

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

      {/* VIDEO PLACEHOLDER */}
      <section style={styles.videoSection}>
        <div style={styles.videoWrap}>
          <div style={styles.videoGlow} />
          <div style={styles.playBtn}>▶</div>
          <div style={styles.videoLabel}>Demo video coming soon</div>
        </div>
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
        <div style={styles.footerText}>© 2025 MagPie</div>
      </footer>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}