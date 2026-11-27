import { createServer } from 'node:http'
import { connect } from 'node:net'
import { once } from 'node:events'

// Test-only CONNECT transport: preserve end-to-end browser TLS/Host/Origin while
// resolving exactly the fixture authorities to one loopback listener.
export async function createFixtureProxy({ port, hosts = [], authorities }) {
  const allowed = new Set(authorities ?? hosts.map(host => `${host}:${port}`))
  const sockets = new Set()
  const track = socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.setTimeout(30_000, () => socket.destroy())
    return socket
  }
  const server = createServer((_request, response) => {
    response.writeHead(403, { Connection: 'close' }); response.end()
  })
  server.on('connection', track)
  server.on('connect', (request, client, head) => {
    if (!allowed.has(request.url)) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const upstream = track(connect(port, '127.0.0.1'))
    client.on('close', () => upstream.destroy())
    upstream.on('close', () => client.destroy())
    upstream.once('connect', () => {
      if (client.destroyed) { upstream.destroy(); return }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      client.pipe(upstream); upstream.pipe(client)
    })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  let closing
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        for (const socket of sockets) socket.destroy()
      })
      return closing
    },
  }
}
