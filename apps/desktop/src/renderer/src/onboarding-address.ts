import { useEffect, useState } from 'react'

const endpoint = 'https://photon.komoot.io/api/'
export const addressLimit = 120
type AddressSuggestion = { street: string; locality: string; value: string }

export async function suggestAddresses(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  const url = new URL(endpoint)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  // Share only this field with the geocoder, never the rest of the draft.
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
  if (!response.ok) throw new Error('Address suggestions unavailable')
  const body = await response.json() as { features?: { properties?: Record<string, unknown> }[] }
  if (!Array.isArray(body.features)) throw new Error('Unexpected address response')
  const addresses = new Map<string, AddressSuggestion>()
  for (const result of body.features.slice(0, 8)) {
    const entry = result?.properties
    const get = (key: string) => typeof entry?.[key] === 'string' ? entry[key].trim() : ''
    if (!get('street') || !get('housenumber')) continue
    // Preserve the provider’s house number and street. Missing regional fields never create punctuation gaps.
    const street = [get('housenumber'), get('street')].join(' ')
    const city = get('city') || get('district')
    const state = get('state'), postalCode = get('postcode'), country = get('country')
    const locality = [city, state, postalCode].filter(Boolean).join(', ')
    // Keep the complete, existing autofill format separate from the option's two-line label.
    const value = [street, city, [state, postalCode].filter(Boolean).join(' '), country].filter(Boolean).join(', ')
    if (value.length <= addressLimit && !/\p{Cc}/u.test(value)) addresses.set(value, { street, locality: locality || country, value })
  }
  return [...addresses.values()].slice(0, 5)
}

export function useAddressSuggestions(query: string, enabled: boolean) {
  const [result, setResult] = useState<{ query: string; options: AddressSuggestion[]; unavailable?: boolean }>({ query: '', options: [] })
  useEffect(() => {
    if (!enabled || query.length < 5) return
    const controller = new AbortController()
    let deadline: ReturnType<typeof setTimeout> | undefined
    const delay = setTimeout(() => {
      deadline = setTimeout(() => {
        controller.abort()
        setResult({ query, options: [], unavailable: true })
      }, 5_000)
      void suggestAddresses(query, controller.signal).then(options => {
        if (!controller.signal.aborted) setResult({ query, options })
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ query, options: [], unavailable: true })
      }).finally(() => clearTimeout(deadline))
    }, 450)
    return () => { clearTimeout(delay); clearTimeout(deadline); controller.abort() }
  }, [query, enabled])
  return enabled && query === result.query ? result : { options: [], unavailable: false }
}
