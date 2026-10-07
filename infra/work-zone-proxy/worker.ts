const upstreams: Record<string, string> = {
  'ovelle.org': 'ovelle-production.jeremymathewgithub.workers.dev',
  'dev.ovelle.org': 'ovelle-development.jeremymathewgithub.workers.dev',
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const upstreamHost = upstreams[url.hostname]
    if (!upstreamHost) return new Response('Not found', { status: 404 })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }

    url.hostname = upstreamHost
    const headers = new Headers()
    for (const name of ['accept', 'range', 'if-none-match', 'if-modified-since']) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    const upstream = await fetch(new Request(url.toString(), {
      method: request.method,
      headers,
      redirect: 'manual',
    }))
    return new Response(upstream.body, upstream)
  },
}
