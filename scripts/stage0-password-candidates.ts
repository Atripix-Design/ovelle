import { argon2id } from '@noble/hashes/argon2.js'

export type Candidate = 'pbkdf2-webcrypto' | 'argon2id-noble'
type Parameters = { saltBytes: number; outputBytes: number } & (
  { algorithm: 'pbkdf2-sha256'; iterations: number } |
  { algorithm: 'argon2id'; memoryKiB: number; passes: number; parallelism: number }
)
// One immutable research profile per candidate drives validation and execution.
// These profiles do not authorize password storage or production authentication.
const sizes = Object.freeze({ saltBytes: 16, outputBytes: 32 })
const pbkdf2 = Object.freeze({ iterations: 600_000 })
const argon = Object.freeze({ memoryKiB: 19_456, passes: 2, parallelism: 1 })

export function validateCandidateParameters(input: Parameters): void {
  if (input.saltBytes !== sizes.saltBytes || input.outputBytes !== sizes.outputBytes) throw new Error('Unsupported salt/output length')
  // Exact bounded research profiles: no silent reduction, no unbounded attacker work.
  if (input.algorithm === 'pbkdf2-sha256' && input.iterations === pbkdf2.iterations) return
  if (input.algorithm === 'argon2id' && input.memoryKiB === argon.memoryKiB && input.passes === argon.passes && input.parallelism === argon.parallelism) return
  throw new Error('Unsupported password KDF parameters')
}

/** Research-only: this is not a credential storage format or production adapter. */
export async function deriveCandidate(candidate: Candidate, password: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  if (salt.length !== sizes.saltBytes) throw new Error('Expected a 16-byte salt')
  if (candidate === 'pbkdf2-webcrypto') {
    const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: pbkdf2.iterations, salt }, key, sizes.outputBytes * 8))
  }
  if (candidate === 'argon2id-noble') {
    return argon2id(password, salt, { m: argon.memoryKiB, t: argon.passes, p: argon.parallelism, dkLen: sizes.outputBytes })
  }
  throw new Error('Unknown KDF candidate')
}
