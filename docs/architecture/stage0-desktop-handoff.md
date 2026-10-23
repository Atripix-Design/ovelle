# Stage 0 desktop handoff backend

The internal Task 9 backend implements a first-party request, explicit browser
approval and one-time native exchange. It reuses current session validation,
issuance, SQL guards, safe HTTP responses and durable auth quotas. The public
Worker does not import these routes. This is backend evidence; Electron main,
preload, system-browser UI, OS storage and packaged restart behavior remain open.

## Protocol and boundaries

| Internal POST | Input | Result |
| --- | --- | --- |
| `/api/v1/auth/desktop/requests` | `state`, `challenge`, `callbackUri` | `requestId`, `expiresAt` (201). No login or credential is issued. |
| `/api/v1/auth/desktop/approve` | `requestId`, `state`, `confirmation: true` | `callbackUrl` containing one-time `code` and the same state. Requires live non-enrollment browser session, exact Origin and CSRF. |
| `/api/v1/auth/desktop/exchange` | `requestId`, `state`, `code`, `verifier`, `callbackUri` | Native-only opaque `token`, `expiresAt`. No cookie, principal or renderer snapshot. |

Creation and exchange reject Cookie, Origin, Authorization and Sec-Fetch-Site.
Their IP and stable 32-byte quota HMAC key come from the trusted server adapter,
not request headers or JSON. All routes require the configured server origin,
POST, no query and strict 4 KiB JSON with no unknown fields. Unsupported methods
return 405/Allow; GET/HEAD/OPTIONS cannot approve or consume anything. Responses
use no-store, no-referrer, restrictive CSP, no CORS and closed redacted errors.

The callback must match the raw canonical form
`http://127.0.0.1:<port>/ovelle-auth/callback`, port 1024–65535 with canonical
decimal spelling. Host aliases, IPv6, credentials, encoded/dot paths, backslashes,
query and fragment fail before URL normalization. This is deliberately the
specific IPv4 callback in the project spec; no arbitrary return URL is accepted.

State is 43 base64url characters representing the native client's random 32-byte
state. The server stores its SHA-256 digest. The only challenge method is S256;
its canonical unpadded 32-byte base64url digest is required. The verifier accepts
43–128 RFC 7636 unreserved characters and is never persisted. Future Electron
main must generate and retain state/verifier, own the exclusive ephemeral
loopback listener, validate the returned state and use the same exact callback
at exchange. These server checks cannot establish main-process ownership.
The model follows the loopback and interception protections described in
[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252#section-7.3) and
[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636#section-4); it does not claim
OAuth-server conformance.

A request lasts five minutes. Approval atomically checks its state, configured
origin, pending status and the current browser session. Explicit confirmation is
required. Approval binds the request to that exact browser session/account and
cannot be replaced or renewed by a later click. It produces a random one-time
code, persisted only as a digest. Code validity is at most sixty seconds, capped
by request and source-session expiry. The callback carries this short-lived code
and state only; it never carries the native bearer credential.

Exchange checks request, state, code, challenge, exact callback, all expiries and
the still-live approving browser. It rechecks these inside the same guarded D1
batch that consumes the code, inserts the native session and appends session.issue
audit. Guard failure aborts the whole batch. Concurrent exchanges yield at most
one native session and audit. Wrong proofs do not consume a code; rate limits
still count them. A later write failure rolls consumption/insertion/audit back.
A lost successful response requires a new sign-in; a code is never replayed to
recover a bearer credential.

Native sessions inherit the source's primary method, federation identity and
connection versions, assurance, passkey credential binding, original authenticated
time, passkey verification time, account security version and absolute expiry.
Exchange changes transport and session identity, not authentication evidence or
the twelve-hour deadline. Enrollment is denied. Database evidence overrides any
principal fields. Required-SAML organization policy remains effective; disabled
providers, credentials, accounts, security epochs and revoked native sessions
still invalidate the normal live-session view. Membership/grant changes remain
subject to the existing next-request organization authorization.

The approving browser must stay live until exchange. After a successful exchange
the new native session is independent: browser-only logout does not implicitly
log out the desktop. Revoke that native session or use logout-all for all sessions.
No bearer, verifier, raw state or code enters audit. The approval table keeps
source-session/account selectors for evidence; account-security audit uses the
existing session.issue event and remains outside organization access-audit reads.

## Storage, quotas and evidence

Migration 0012 adds `desktop_auth_requests` without rewriting existing tables.
It enforces pending→approved→consumed transitions, immutable request and approval
bindings, complete non-NULL approval evidence, matching browser/account source,
fixed request lifetime and bounded code/consumption times. Foreign keys preserve
account/session relationships. Service SQL additionally checks current authority;
the schema's source relationship alone is not an authorization decision.

Request starts consume five requests per IP per fifteen-minute purpose window
and share the thirty-per-IP challenge ceiling. Exchange reserves the existing
five-failure per IP/purpose and shared thirty-per-IP window; successful exchange
refunds its lease, failed proof does not. Limits contain keyed digests, not raw
IP/state/code. A trusted edge integration and stable environment key remain
required before enabling public routing. Request-path cleanup deletes at most
100 expired handoffs per start, using the expiry index. There is no claim of a
scheduled retention service or unlimited-load acceptance.

Tests cover strict callback/proof inputs, pending-only approval, enrollment and
transport denial, CSRF, five-minute/sixty-second boundaries, shortened source
expiry, forged principal assurance, same-code and same-approval races, revocation
between preflight and final SQL, rollback on later batch failure, durable quotas,
digest-only storage/audit and populated-schema migration. Signed passkey fixtures
exercise required-SAML plus passkey provenance; provider disablement and passkey
revocation invalidate issued native sessions. HTTP tests use the internal handler
and local D1 fixtures, without live providers or remote migrations.

## Still unfinished

Original Task 9 is incomplete: no Electron listener, browser approval page,
safeStorage implementation, allowlisted IPC, renderer credential inspection,
Windows/macOS package sign-in/restart tests or live identity rollout is provided
by this backend slice. No UI/Figma changes were made. Original Task 5's advisory
capability snapshot is still absent; live authorization and grant containment
already exist and must not be reimplemented just to match an old helper name.
Task 4/8 recovery, password runtime selection and the broader Stage 0 volunteer,
private documents/signatures and backup/restore obligations remain open.
