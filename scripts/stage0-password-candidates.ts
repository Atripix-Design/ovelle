import { argon2id } from '@noble/hashes/argon2.js'

export type Candidate = 'pbkdf2-webcrypto' | 'argon2id-noble'
type Parameters = { saltBytes: number; outputBytes: number } & (
  { algorithm: 'pbkdf2-sha256'; iterations: number } |
  { algorithm: 'argon2id'; memoryKiB: number; passes: number; parallelism: number }
)
export function validateCandidateParameters(input: Parameters): void {
  if (input.saltBytes !== 16 || input.outputBytes !== 32) throw new Error('Unsupported salt/output length')
  // Exact bounded research profiles: no silent reduction, no unbounded attacker work.
  if (input.algorithm === 'pbkdf2-sha256' && input.iterations === 600_000) return
  if (input.algorithm === 'argon2id' && input.memoryKiB === 19_456 && input.passes === 2 && input.parallelism === 1) return
  throw new Error('Unsupported password KDF parameters')
}

/** Research-only: this is not a credential storage format or production adapter. */
export async function deriveCandidate(candidate: Candidate, password: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  if (salt.length !== 16) throw new Error('Expected a 16-byte salt')
  if (candidate === 'pbkdf2-webcrypto') {
    validateCandidateParameters({ algorithm: 'pbkdf2-sha256', iterations: 600_000, saltBytes: salt.length, outputBytes: 32 })
    const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt }, key, 256))
  }
  if (candidate === 'argon2id-noble') {
    validateCandidateParameters({ algorithm: 'argon2id', memoryKiB: 19_456, passes: 2, parallelism: 1, saltBytes: salt.length, outputBytes: 32 })
    return argon2id(password, salt, { m: 19_456, t: 2, p: 1, dkLen: 32 })
  }
  throw new Error('Unknown KDF candidate')
}
