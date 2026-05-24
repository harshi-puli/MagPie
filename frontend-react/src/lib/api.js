const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export async function checkStatus() {
  return request('/status')
}

export async function crawlUrl({ url, folder, mode, anthropicKey, sessionId, saveHistory = true }) {
  return request('/crawl', {
    method: 'POST',
    body: JSON.stringify({
      url,
      folder,
      mode,
      anthropic_key: anthropicKey || undefined,
      session_id: sessionId,
      save_history: saveHistory,
    }),
  })
}

export async function analyzeProject({ githubUrl, folder, sessionId, saveToObsidian = true, saveHistory = true }) {
  return request('/project', {
    method: 'POST',
    body: JSON.stringify({
      github_url: githubUrl,
      folder,
      session_id: sessionId,
      save_to_obsidian: saveToObsidian,
      save_history: saveHistory,
    }),
  })
}

export async function getGraph(sessionId) {
  return request(`/graph/${sessionId}`)
}

export async function getSessionHistory(sessionId) {
  return request(`/history/${sessionId}`)
}