export type Route = { kind: 'home' | 'exercises' | 'workouts' | 'gyms' | 'settings' }
  | { kind: 'history'; sessionId?: string; returnTo: 'home' | 'workouts' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const [kind, encodedId] = path.split('/')
  if (kind === 'history') {
    let sessionId: string | undefined
    try { sessionId = encodedId ? decodeURIComponent(encodedId) : undefined } catch { /* Invalid IDs fall back to the history list. */ }
    return { kind, sessionId, returnTo: new URLSearchParams(query).get('from') === 'home' ? 'home' : 'workouts' }
  }
  if (kind === 'exercises' || kind === 'workouts' || kind === 'gyms' || kind === 'settings') return { kind }
  return { kind: 'home' }
}

export function formatRoute(route: Route): string {
  return `#/${route.kind}${route.kind === 'history' && route.sessionId ? `/${encodeURIComponent(route.sessionId)}` : ''}${route.kind === 'history' && route.returnTo === 'home' ? '?from=home' : ''}`
}
