import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ── Profile helpers ───────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function upsertProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Crawl history helpers ─────────────────────────────────────────────────────

export async function saveCrawl(userId, entry) {
  const { data, error } = await supabase
    .from('crawls')
    .insert({
      user_id: userId,
      type: entry.type,
      url: entry.url,
      title: entry.title,
      summary: entry.summary || entry.description,
      tags: entry.tags || [],
      links: entry.links || [],
      key_terms: entry.key_terms || [],
      main_ideas: entry.main_ideas || [],
      questions: entry.questions || [],
      sentiment_arc: entry.sentiment_arc || [],
      stats: entry.stats || {},
      related_links: entry.related_links || [],
      co_occurrences: entry.co_occurrences || [],
      entities: entry.entities || [],
      mode: entry.mode || 'surface',
      tier: entry.tier || 'free',
      vault_path: entry.vault_path || '',
      crawled_at: entry.crawled_at || new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getCrawls(userId, limit = 50) {
  const { data, error } = await supabase
    .from('crawls')
    .select('*')
    .eq('user_id', userId)
    .order('crawled_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function deleteCrawl(id) {
  const { error } = await supabase
    .from('crawls')
    .delete()
    .eq('id', id)
  if (error) throw error
}