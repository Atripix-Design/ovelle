import assert from 'node:assert/strict'
import { createServer, connect } from 'node:net'
import { once } from 'node:events'
import { test } from 'node:test'
import { createFixtureProxy } from './stage0-browser-proxy.mjs'

test('fixture proxy tunnels only exact hosts/port, preserves bytes and closes active tunnels', { timeout: 5_000 }, async () => {
  const peers = new Set()
  const target = createServer(socket => {
    peers.add(socket); socket.on('close', () => peers.delete(socket))
    socket.pipe(socket)
  })
  target.listen(0, '127.0.0.1'); await once(target, 'listening')
  const port = target.address().port
  let proxy
  const clients = []
  try {
    const authorities = ['dev.ovelle.org', 'identity.example.test', 'attacker.example.test'].map(host => `${host}:${port}`)
    authorities.push('accounts.google.com:443', 'login.microsoftonline.com:443')
    proxy = await createFixtureProxy({ port, hosts: [], authorities })
    const request = async line => {
      const socket = connect(new URL(proxy.url).port, '127.0.0.1'); clients.push(socket)
      await once(socket, 'connect')
      socket.write(line + '\r\nHost: ignored.example.test\r\n\r\n')
      const [response] = await once(socket, 'data')
      return { socket, response: response.toString() }
    }
    for (const authority of authorities) {
      const { socket, response } = await request(`CONNECT ${authority} HTTP/1.1`)
      assert.match(response, /^HTTP\/1.1 200 /)
      const payload = Buffer.from([0, 255, 22, 3, 3, 42])
      socket.write(payload)
      assert.deepEqual((await once(socket, 'data'))[0], payload)
    }
    for (const authority of ['dev.ovelle.org:443', `accounts.google.com:${port}`, `outside.example.test:${port}`, `dev.ovelle.org:${port + 1}`, `dev.ovelle.org.evil.test:${port}`, `127.0.0.1:${port}`, `dev.ovelle.org:${port}/path`]) {
      assert.match((await request(`CONNECT ${authority} HTTP/1.1`)).response, /^HTTP\/1.1 403 /)
    }
    assert.match((await request(`GET http://dev.ovelle.org:${port}/ HTTP/1.1`)).response, /^HTTP\/1.1 403 /)
    const closed = clients.slice(0, authorities.length).map(socket => once(socket, 'close'))
    await proxy.close(); await Promise.all(closed)
    await assert.rejects(async () => {
      const socket = connect(new URL(proxy.url).port, '127.0.0.1')
      try { await once(socket, 'connect') } finally { socket.destroy() }
    }, /ECONNREFUSED/)
  } finally {
    clients.forEach(socket => socket.destroy())
    await proxy?.close()
    peers.forEach(socket => socket.destroy())
    await new Promise(resolve => target.close(resolve))
  }
})
