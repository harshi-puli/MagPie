import React, { useState } from 'react'
import { signInWithGoogle } from '../lib/supabase'

export default function AuthModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogle() {
    setLoading(true)
    setError('')
    try {
      await signInWithGoogle()
      // Supabase redirects to /auth/callback automatically
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Close */}
        <button style={closeBtn} onClick={onClose}>✕</button>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8, animation: 'bob 2s ease-in-out infinite', display: 'inline-block' }}>🐦‍⬛</div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 26, color: '#f0eff5' }}>
            Welcome to MagPie
          </div>
          <div style={{ fontSize: 13, color: '#8888aa', marginTop: 6 }}>
            Sign in to save your knowledge graph across devices
          </div>
        </div>

        {/* Google button */}
        <button style={{ ...googleBtn, opacity: loading ? 0.7 : 1 }} onClick={handleGoogle} disabled={loading}>
          {loading ? (
            <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} className="spin" />
          ) : (
            <GoogleIcon />
          )}
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, fontSize: 13, color: '#e74c3c', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Fine print */}
        <div style={{ marginTop: 24, fontSize: 12, color: '#555566', textAlign: 'center', lineHeight: 1.6 }}>
          By signing in you agree to our terms.<br />
          Your API keys are never stored on our servers.
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
    </svg>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, animation: 'fadeIn 0.2s ease-out',
}

const modal = {
  background: '#111118', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 420,
  position: 'relative', animation: 'fadeUp 0.3s ease-out',
}

const closeBtn = {
  position: 'absolute', top: 16, right: 16,
  background: 'none', border: 'none', color: '#555566',
  fontSize: 18, cursor: 'pointer', padding: 4,
  lineHeight: 1,
}

const googleBtn = {
  width: '100%', padding: '14px 20px',
  background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
  borderRadius: 10, color: '#f0eff5', fontSize: 15, fontWeight: 700,
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: 12, transition: 'all 0.2s',
  fontFamily: "'Syne', sans-serif",
}