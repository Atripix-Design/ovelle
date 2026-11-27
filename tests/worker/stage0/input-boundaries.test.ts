import { expect, it } from 'vitest'
import { exactObject } from '../../../src/cloudflare/stage0/domain/input'
import { grants, segment } from '../../../src/cloudflare/stage0/http/input'
import { normalizedGrants } from '../../../src/cloudflare/stage0/staff/validation'

it('checks exact object fields without coercion, defaults or copying', () => {
  const value = { version: '1' }
  expect(exactObject(value, ['version', 'name'])).toBe(value)
  expect(exactObject({}, ['version'])).toEqual({})
  for (const input of [null, [], 3, 'object', { version: 1, hidden: true }]) {
    expect(() => exactObject(input, ['version'])).toThrow('invalid_input')
  }
  expect(() => exactObject(value, ['version', 'name'], true)).toThrow('invalid_input')
  expect(() => exactObject(Object.create({ version: 1 }), ['version'], true)).toThrow('invalid_input')
  expect(exactObject({ version: undefined }, ['version'], true)).toEqual({ version: undefined })
})

it('decodes path segments once and rejects encoded routing separators and controls', () => {
  expect(segment('caf%C3%A9')).toBe('café')
  expect(segment('%252F')).toBe('%2F')
  expect(segment('a'.repeat(256))).toHaveLength(256)
  for (const input of ['', '%', '%C3', '%2F', '%3F', '%23', '%00', '%C2%80', 'a'.repeat(257)]) {
    expect(() => segment(input)).toThrow('invalid_input')
  }
})

it('rejects unknown grant DTO fields at both levels while leaving domain semantics to the service', () => {
  for (const value of [null, {}, Array(33).fill({}), [{}], [{ action: 'program.read', scope: {}, extra: 1 }], [{ action: 'program.read', scope: { kind: 'organization', extra: 1 } }]]) {
    expect(() => grants(value)).toThrow('invalid_input')
  }
  const unknown = [{ action: 'unknown', scope: { kind: 'organization' } }]
  expect(grants(unknown)).toBe(unknown)
  expect(() => normalizedGrants(grants(unknown), 'admin')).toThrow('invalid_input')
  const missingDimension = [{ action: 'program.read', scope: { kind: 'program_location' } }]
  expect(grants(missingDimension)).toBe(missingDimension)
  expect(() => normalizedGrants(grants(missingDimension), 'coordinator')).toThrow('invalid_input')
})
