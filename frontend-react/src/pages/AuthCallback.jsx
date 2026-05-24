import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getProfile } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/'); return }
      const profile = await getProfile(session.user.id).catch(() => null)
      if (!profile) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
    })
  }, [navigate])

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0a0f', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:40, animation:'bob 2s ease-in-out infinite' }}>🐦‍⬛</div>
      <div style={{ color:'#8888aa', fontSize:14, fontFamily:'Syne,sans-serif' }}>Signing you in…</div>
    </div>
  )
}
