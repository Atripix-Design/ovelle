import { deriveCandidate, type Candidate } from './stage0-password-candidates'

// Public, synthetic vectors independently generated with Node/OpenSSL. Never use
// these salts/passwords in credential storage. The probe accepts no user secrets.
export const expectedVectors: Record<Candidate, string> = {
  'pbkdf2-webcrypto': '87c243db92a3445dc9be00dcd886533cfc06745c45c0e7f75acdadf4694e3b5e',
  'argon2id-noble': '8fd6b591e7e27088a9daa4d4056afcebae6f41336ebfae9979c7ac4bf77c8d89',
}
export async function probeCandidate(candidate: Candidate, mismatch = false): Promise<boolean> {
  const password = new TextEncoder().encode(mismatch ? 'incorrect fixture password' : 'Ovelle runtime fixture — not a credential')
  const salt = new TextEncoder().encode('ovelle-test-salt')
  const output = await deriveCandidate(candidate, password, salt)
  const hex = Array.from(output, byte => byte.toString(16).padStart(2, '0')).join('')
  return hex === expectedVectors[candidate]
}

// This module is bundled only by the local research runner. It is never imported
// by the application Worker and must not be deployed as a public hashing service.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/baseline') return Response.json({ ok: true })
    const candidate = url.searchParams.get('candidate')
    if (candidate !== 'pbkdf2-webcrypto' && candidate !== 'argon2id-noble') return new Response(null, { status: 400 })
    try {
      const matches = await probeCandidate(candidate, url.pathname === '/mismatch')
      return Response.json({ status: 'ok', matches })
    } catch (error) {
      // Keep exact platform failure evidence; all inputs here are synthetic.
      return Response.json({ status: 'error', name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : 'Unknown' })
    }
  },
}
