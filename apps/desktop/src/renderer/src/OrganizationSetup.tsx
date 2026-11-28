import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Button, Field } from '@ovelle/ui'
import tide from './onboarding-tide.svg'
import { addressLimit, useAddressSuggestions } from './onboarding-address'
import './organization-setup.css'

type Props =
  | { mode: 'setup'; request: (input: unknown) => Promise<unknown>; onCreated: () => void; onBusyChange: (busy: boolean) => void }
  | { mode: 'preview'; onFinish: () => void }
type Details = { name: string; contactEmail: string; timeZone: string; firstProgram: string; firstLocation: string }
type Detail = Exclude<keyof Details, 'timeZone'>
const steps = [
  { label: 'Organization', title: 'Create your organization', intro: 'Give your volunteer team a place to plan shifts, coordinate people, and track hours.' },
  { label: 'First program', title: 'Build your experience', intro: 'Name the first program your team will run at this location.' },
  { label: 'Review', title: 'Review your workspace', intro: 'Check the details before you create your organization.' },
]
const fields = {
  name: { label: 'Organization name', example: 'e.g. Harbor Community Center…', autoComplete: 'organization', hint: '' },
  contactEmail: { label: 'Organization contact email', example: 'e.g. team@example.org…', autoComplete: 'email', hint: 'This can be different from your sign-in email.' },
  firstProgram: { label: 'First program', example: 'e.g. Community Pantry…', autoComplete: 'off', hint: '' },
  firstLocation: { label: 'First location address', example: 'Start with a street number and name…', autoComplete: 'street-address', hint: 'Choose an address from the list or enter it manually.' },
} satisfies Record<Detail, { label: string; example: string; autoComplete: string; hint: string }>
const groups: readonly (readonly Detail[])[] = [['name', 'contactEmail', 'firstLocation'], ['firstProgram']]
const allFields = groups.flat()

function fieldError(key: Detail, raw: string) {
  const value = raw.trim()
  if (!value) return `Enter the ${fields[key].label.toLowerCase()}.`
  if ([...value].some(character => character.charCodeAt(0) < 32 || (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159))) return 'Remove any line breaks or special control characters.'
  if (key === 'contactEmail' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) return 'Enter an email address like team@example.org.'
  return undefined
}

/** Compose shared controls without moving the service’s passkey or write authority into the renderer. */
export default function OrganizationSetup(props: Props) {
  const [details, setDetails] = useState<Details>(() => ({
    name: '', contactEmail: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', firstProgram: '', firstLocation: '',
  }))
  const [addressOpen, setAddressOpen] = useState(false)
  const [addressIndex, setAddressIndex] = useState(-1)
  const [chosenAddress, setChosenAddress] = useState('')
  const [{ step, direction }, setPhase] = useState<{ step: number; direction?: 'forward' | 'back' }>({ step: 0 })
  const [errors, setErrors] = useState<Partial<Record<Detail, string>>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  // When the response is lost, the request may already have succeeded. Never regenerate the key on retry.
  const pending = useRef<{ values: Details; key: string } | null>(null)
  const { options, unavailable } = useAddressSuggestions(details.firstLocation.trim(),
    step === 0 && addressOpen && details.firstLocation !== chosenAddress)
  const expanded = addressOpen && options.length > 0
  useEffect(() => {
    if (expanded && addressIndex >= 0) document.getElementById(`setup-address-${addressIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [addressIndex, expanded])
  function update(key: Detail, value: string) {
    setDetails(prior => ({ ...prior, [key]: value }))
    setErrors(prior => prior[key] ? { ...prior, [key]: undefined } : prior)
  }
  function chooseAddress(value: string) {
    update('firstLocation', value)
    setChosenAddress(value)
    setAddressOpen(false)
    setAddressIndex(-1)
  }
  function addressKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setAddressOpen(false); setAddressIndex(-1); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!expanded) { setAddressOpen(true); return }
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setAddressIndex(index => index < 0 ? (direction > 0 ? 0 : options.length - 1) : (index + direction + options.length) % options.length)
    } else if (event.key === 'Enter' && expanded && options[addressIndex]) {
      event.preventDefault()
      chooseAddress(options[addressIndex].value)
    }
  }


  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => { if (failed) alert.current?.focus() }, [failed])

  async function create() {
    if (props.mode !== 'setup' || inFlight.current) return
    inFlight.current = true
    const command = pending.current ?? {
      key: crypto.randomUUID(),
      values: { ...details, name: details.name.trim(), contactEmail: details.contactEmail.trim(),
        timeZone: details.timeZone.trim(), firstProgram: details.firstProgram.trim(), firstLocation: details.firstLocation.trim() },
    }
    pending.current = command
    setBusy(true)
    props.onBusyChange(true)
    setFailed(false)
    try {
      await props.request({ operation: 'createOrganization', ...command.values, idempotencyKey: command.key })
      props.onCreated()
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setBusy(false)
      props.onBusyChange(false)
    }
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 2) {
      // The preview has no organization bridge or write callback.
      if (props.mode === 'preview') props.onFinish()
      else void create()
      return
    }
    const nextErrors: Partial<Record<Detail, string>> = {}
    for (const key of groups[step]) nextErrors[key] = fieldError(key, details[key])
    setErrors(nextErrors)
    const invalid = groups[step].find(key => nextErrors[key])
    if (invalid) {
      // Allow React to commit the description before moving focus.
      requestAnimationFrame(() => document.getElementById(`setup-${invalid}`)?.focus())
      return
    }
    setPhase({ step: step + 1, direction: 'forward' })
  }

  const current = steps[step]
  return <main className="organization-setup" data-ovelle-theme="light">
    <div className="organization-setup__content">
      <div className="organization-setup__tracker">
        <div className="organization-setup__progress" aria-hidden="true">
          {steps.map((item, index) => <span key={item.label} data-current={index === step || undefined} />)}
        </div>
        <p className="organization-setup__step">Step {step + 1} of {steps.length} / {current.label}</p>
      </div>
      <div className="organization-setup__stack" key={step} data-direction={direction}>
        <h1 className="organization-setup__title" tabIndex={-1} ref={heading}>{current.title}</h1>
        <p className="organization-setup__intro">{current.intro}</p>
        <form noValidate onSubmit={advance}>
          {step < 2 ? <div className="organization-setup__fields">
            {groups[step].map(key => {
              const address = key === 'firstLocation'
              const control = <Field id={`setup-${key}`} name={key}
                label={fields[key].label} placeholder={fields[key].example} autoComplete={fields[key].autoComplete}
                type={key === 'contactEmail' ? 'email' : 'text'} spellCheck={key !== 'contactEmail' && !address}
                autoCapitalize={key === 'contactEmail' ? 'none' : undefined} required
                maxLength={key === 'contactEmail' ? 254 : address ? addressLimit : 120}
                value={details[key]} hint={address && unavailable ? 'Enter the full address manually.' : fields[key].hint} error={errors[key]}
                supportingText={fields[key].hint ? 'visible' : 'hidden'}
                material="solid" className="organization-setup__field"
                {...(address ? {
                  role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': expanded,
                  'aria-controls': expanded ? 'setup-address-options' : undefined,
                  'aria-activedescendant': expanded && options[addressIndex] ? `setup-address-${addressIndex}` : undefined,
                  onFocus: () => setAddressOpen(true),
                  onBlur: () => { setAddressOpen(false); setAddressIndex(-1) },
                  onKeyDown: addressKeys,
                } as const : {})}
                onChange={event => {
                  update(key, event.target.value)
                  if (address) { setAddressOpen(true); setAddressIndex(-1) }
                }} />
              return <div key={key} className={address ? "organization-setup__address" : undefined}>{control}
                {address && expanded && <div className="organization-setup__address-menu">
                  <ul id="setup-address-options" role="listbox" aria-label="Address suggestions">
                  {options.map((option, index) => <li key={option.value} id={`setup-address-${index}`} role="option" aria-label={option.value}
                    aria-selected={index === addressIndex} onPointerDown={event => event.preventDefault()}
                    onClick={() => chooseAddress(option.value)}>
                    <span className="organization-setup__address-street">{option.street}</span>
                    {option.locality && <span className="organization-setup__address-locality">{option.locality}</span>}
                  </li>)}
                  </ul>
                  <small className="organization-setup__address-source">© OpenStreetMap contributors</small>
                </div>}
                {address && <span className="ov-sr-only" role="status">
                  {unavailable ? 'Address suggestions are unavailable.' : expanded ? `${options.length} address suggestions available.` : ''}
                </span>}
              </div>
            })}
          </div> : <dl className="organization-setup__summary">
            {allFields.map(key => <div key={key}><dt>{fields[key].label}</dt><dd>{details[key].trim()}</dd></div>)}
            <div><dt>Device time zone</dt><dd>{details.timeZone}</dd></div>
          </dl>}
          {failed && <div className="organization-setup__alert" tabIndex={-1} ref={alert} role="alert">
            <strong>Creation could not be confirmed.</strong>
            <p>Retry the same request to avoid creating a duplicate. If your session isn’t passkey verified, sign out and approve this device again.</p>
          </div>}
          <div className="organization-setup__actions">
            {step > 0 && !pending.current && <Button variant="secondary" className="organization-setup__back" onClick={() => { setErrors({}); setPhase({ step: step - 1, direction: 'back' }) }}>Back</Button>}
            <Button type="submit" className="organization-setup__next" surfaceClassName="organization-setup__next-surface"
              material="solid" state={busy ? 'loading' : 'default'} loadingLabel="Creating organization…">
              {failed ? 'Retry setup' : ['Continue', 'Review details', props.mode === 'preview' ? 'Finish preview' : 'Create organization'][step]}
              {step < 2 && <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M4.25 10h10.5m-4.7-4.55L14.75 10l-4.7 4.55" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>}
            </Button>
          </div>
          <span className="ov-sr-only" role="status">{busy ? 'Creating organization…' : ''}</span>
          {step === 2 && !pending.current && <p className="organization-setup__note">
            {props.mode === 'preview' ? 'Preview only. No organization will be created or changed.' : 'Creating an organization requires a passkey-verified session.'}
          </p>}
        </form>
      </div>
    </div>
    <div className="organization-setup__art" aria-hidden="true">
      <img src={tide} alt="" width="960" height="1022" />
    </div>
  </main>
}
