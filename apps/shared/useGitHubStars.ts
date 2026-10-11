import { useEffect, useState } from 'react';

const api = 'https://api.github.com/repos/Atripix-Design/ovelle';
const storageKey = 'ovelle.github-stars.v1';
const lifetime = 15 * 60 * 1000;
type Snapshot = { count: number | null; loading: boolean };
type Cache = { count: number; fetchedAt: number };
let pending: Promise<number | null> | undefined;

function cachedCount(): Cache | null {
  try {
    const cache = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return cache && Number.isSafeInteger(cache.count) && cache.count >= 0 && Number.isFinite(cache.fetchedAt) && Date.now() - cache.fetchedAt >= 0 && Date.now() - cache.fetchedAt < lifetime ? cache : null;
  } catch { return null; }
}

/** Application data stays outside @ovelle/ui. StrictMode and both headers share one request. */
export function useGitHubStars(): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => { const cached = cachedCount(); return { count: cached?.count ?? null, loading: !cached }; });
  useEffect(() => {
    const cached = cachedCount();
    if (cached) { setSnapshot({ count: cached.count, loading: false }); return; }
    let active = true;
    pending ??= fetch(api, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) })
      .then(async response => {
        if (!response.ok) throw new Error('GitHub unavailable');
        const data = await response.json();
        if (!Number.isSafeInteger(data.stargazers_count) || data.stargazers_count < 0) throw new Error('Invalid star count');
        try { localStorage.setItem(storageKey, JSON.stringify({ count: data.stargazers_count, fetchedAt: Date.now() })); } catch { /* Storage is optional. */ }
        return data.stargazers_count as number;
      }).catch(() => null).finally(() => { pending = undefined; });
    const request = pending;
    void request.then(count => { if (active) setSnapshot({ count, loading: false }); });
    // Both StrictMode effects share the in-flight request; successful results persist for 15 minutes.
    return () => { active = false; };
  }, []);
  return snapshot;
}
