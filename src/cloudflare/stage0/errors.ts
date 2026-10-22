const statuses = {
  unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409,
  invalid_input: 400, rate_limited: 429, configuration: 503,
} as const
export type Stage0ErrorCode = keyof typeof statuses

// A closed vocabulary prevents arbitrary upstream messages entering API responses.
export class Stage0Error extends Error {
  readonly code: Stage0ErrorCode
  readonly status: number
  constructor(code: Stage0ErrorCode) {
    if (!Object.hasOwn(statuses, code)) throw new TypeError('Unknown Stage 0 error code')
    super(code)
    this.name = 'Stage0Error'
    this.code = code
    this.status = statuses[code]
  }
}
