import { expect, it } from 'vitest'
import { normalizedEmail } from '../../../src/cloudflare/stage0/auth/contact'
import { identifier, invitationEmail, normalizedGrants, version } from '../../../src/cloudflare/stage0/staff/validation'

it('preserves staff invitation address normalization and its stricter Unicode control boundary', () => {
  expect(invitationEmail('  Person+Staff@Example.TEST  ')).toBe('person+staff@example.test')
  for (const address of [null, 4, '', 'a@b', 'a@@example.test', '<a@example.test>', 'a b@example.test', 'a@example.test\n', '\u0000a@example.test', 'a\u007f@example.test', 'a\u0080@example.test', 'a\u009f@example.test']) {
    expect(() => invitationEmail(address)).toThrow('invalid_input')
  }
  // Preserve the existing distinction instead of broadening account policy during
  // a structural migration. The mail transport applies an additional restriction.
  expect(normalizedEmail('a\u0080@example.test')).toBe('a\u0080@example.test')
  expect(invitationEmail('a'.repeat(241) + '@example.test')).toHaveLength(254)
  expect(() => invitationEmail('a'.repeat(242) + '@example.test')).toThrow('invalid_input')
})

it('preserves exact identifiers and rejects unsafe version/control values', () => {
  expect(identifier(' member ')).toBe(' member ')
  expect(identifier('a'.repeat(256))).toHaveLength(256)
  for (const input of ['', 'a'.repeat(257), 'a\u0080', null, 1]) expect(() => identifier(input)).toThrow('invalid_input')
  expect(version(1)).toBe(1)
  expect(version(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER - 1)
  for (const input of [0, -1, 1.5, '1', null, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => version(input)).toThrow('invalid_input')
})

it('canonicalizes grant offers without mutating callers and rejects duplicate semantic scopes', () => {
  const input = [
    { action: 'program.read', scope: { kind: 'program_location', locationId: 'l', programId: 'p' } },
    { action: 'location.read', scope: { kind: 'organization' } },
  ]
  const before = structuredClone(input)
  expect(normalizedGrants(input, 'coordinator')).toEqual([
    { action: 'location.read', scope: { kind: 'organization' } },
    { action: 'program.read', scope: { kind: 'program_location', programId: 'p', locationId: 'l' } },
  ])
  expect(input).toEqual(before)
  expect(() => normalizedGrants([input[0], { action: 'program.read', scope: { programId: 'p', kind: 'program_location', locationId: 'l' } }], 'coordinator')).toThrow('invalid_input')
  expect(() => normalizedGrants([{ action: 'program.read', scope: { kind: 'program_location', programId: 'p\u0080' } }], 'coordinator')).toThrow('invalid_input')
  expect(() => normalizedGrants(Array(33).fill(input[0]), 'admin')).toThrow('invalid_input')
})
