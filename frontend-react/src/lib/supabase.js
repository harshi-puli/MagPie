import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
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

/**
 * Fetches the profile row. Returns null if not found (PGRST116).
 */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Called on every login/session restore. Creates the profile row if it doesn't
 * exist yet (fixes the foreign-key constraint that silently breaks saveCrawl).
 */
export async function ensureProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    .select()
    .single()
  // PGRST116 = no rows returned by ignoreDuplicates upsert — that's fine
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

/**
 * Saves a crawl result. Throws on error so callers can surface it to the user
 * instead of silently dropping data.
 */
export async function saveCrawl(userId, entry) {
  // Normalise fields that must be jsonb (objects/arrays-of-objects),
  // and fields that must be text[] (arrays of strings).
  // This prevents type-mismatch errors from the API response shape varying.
  const toTextArray = val => {
    if (!val) return []
    if (Array.isArray(val)) return val.map(v => (typeof v === 'string' ? v : String(v)))
    return []
  }
  const toJsonb = val => {
    if (!val) return null
    // Already a plain object/array — Supabase client serialises fine
    return val
  }

  const payload = {
    user_id:        userId,
    type:           entry.type           || 'article',
    url:            entry.url            || '',
    title:          entry.title          || '',
    summary:        entry.summary        || entry.description || '',
    tags:           toTextArray(entry.tags),
    links:          toTextArray(entry.links),
    key_terms:      toTextArray(entry.key_terms),
    main_ideas:     toTextArray(entry.main_ideas),
    questions:      toTextArray(entry.questions),
    entities:       toTextArray(entry.entities),
    mode:           entry.mode           || 'surface',
    tier:           entry.tier           || 'free',
    vault_path:     entry.vault_path     || '',
    crawled_at:     entry.crawled_at     || new Date().toISOString(),
    // jsonb columns
    sentiment_arc:  toJsonb(entry.sentiment_arc),
    stats:          toJsonb(entry.stats)          || {},
    related_links:  toJsonb(entry.related_links)  || [],
    co_occurrences: toJsonb(entry.co_occurrences) || [],
  }

  const { data, error } = await supabase
    .from('crawls')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[saveCrawl] Supabase error:', error)
    throw error
  }
  return data
}

export async function getCrawls(userId, limit = 100) {
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
  const { error } = await supabase.from('crawls').delete().eq('id', id)
  if (error) throw error
}