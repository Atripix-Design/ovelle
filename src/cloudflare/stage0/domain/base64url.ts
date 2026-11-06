/** Unpadded URL-safe encoding shared by bearer secrets, PKCE and WebAuthn.
 * Decoding limits and authentication error semantics remain protocol-owned.
 */
export function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
