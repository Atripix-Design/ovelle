import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Field } from '@ovelle/ui'
import communityLoop from './community-loop.webp'
import './organization-setup.css'

type Props = { request: (input: unknown) => Promise<unknown>; onCreated: () => void; onBusyChange: (busy: boolean) => void }
type Details = { name: string; contactEmail: string; timeZone: string; firstProgram: string; firstLocation: string }
type Detail = keyof Details
const steps = [
  { label: 'Organization', title: 'Create your organization', intro: 'Give your volunteer team a place to plan shifts, coordinate people, and track hours.' },
  { label: 'First program', title: 'Build your experience', intro: 'Add your first program and the place where it happens.' },
  { label: 'Review', title: 'Review your workspace', intro: 'Check the details before you create your organization.' },
]
const fields = {
  name: { label: 'Organization name', example: 'e.g. Harbor Community Center…', autoComplete: 'organization', hint: '' },
  contactEmail: { label: 'Organization contact email', example: 'e.g. team@example.org…', autoComplete: 'email', hint: 'This can be different from your sign-in email.' },
  timeZone: { label: 'Time zone', example: 'e.g. America/New_York…', autoComplete: 'off', hint: 'This starts with your device time zone. Change it if needed.' },
  firstProgram: { label: 'First program', example: 'e.g. Community Pantry…', autoComplete: 'off', hint: '' },
  firstLocation: { label: 'First location', example: 'e.g. North Hall…', autoComplete: 'off', hint: 'Enter the site name, not a street address.' },
} satisfies Record<Detail, { label: string; example: string; autoComplete: string; hint: string }>
const groups: readonly (readonly Detail[])[] = [['name', 'contactEmail', 'timeZone'], ['firstProgram', 'firstLocation']]
const allFields = groups.flat()

function fieldError(key: Detail, raw: string) {
  const value = raw.trim()
  if (!value) return `Enter ${key === 'timeZone' ? 'a time zone' : `the ${fields[key].label.toLowerCase()}`}.`
  if ([...value].some(character => character.charCodeAt(0) < 32 || (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159))) return 'Remove any line breaks or special control characters.'
  if (key === 'contactEmail' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) return 'Enter an email address like team@example.org.'
  if (key === 'timeZone') {
    try {
      if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value)) throw new RangeError()
      new Intl.DateTimeFormat('en', { timeZone: value })
    } catch { return 'Enter a recognized time zone, such as America/New_York.' }
  }
  return undefined
}

/** Compose shared controls without moving the service’s passkey or write authority into the renderer. */
export default function OrganizationSetup({ request, onCreated, onBusyChange }: Props) {
  const [details, setDetails] = useState<Details>(() => ({
    name: '', contactEmail: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', firstProgram: '', firstLocation: '',
  }))
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Partial<Record<Detail, string>>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  // When the response is lost, the request may already have succeeded. Never regenerate the key on retry.
  const pending = useRef<{ values: Details; key: string } | null>(null)

  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => { if (failed) alert.current?.focus() }, [failed])

  async function create() {
    if (inFlight.current) return
    inFlight.current = true
    const command = pending.current ?? {
      key: crypto.randomUUID(),
      values: { ...details, name: details.name.trim(), contactEmail: details.contactEmail.trim(),
        timeZone: details.timeZone.trim(), firstProgram: details.firstProgram.trim(), firstLocation: details.firstLocation.trim() },
    }
    pending.current = command
    setBusy(true)
    onBusyChange(true)
    setFailed(false)
    try {
      await request({ operation: 'createOrganization', ...command.values, idempotencyKey: command.key })
      onCreated()
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 2) { void create(); return }
    const nextErrors: Partial<Record<Detail, string>> = {}
    for (const key of groups[step]) nextErrors[key] = fieldError(key, details[key])
    setErrors(nextErrors)
    const invalid = groups[step].find(key => nextErrors[key])
    if (invalid) {
      // Allow React to commit the description before moving focus.
      requestAnimationFrame(() => document.getElementById(`setup-${invalid}`)?.focus())
      return
    }
    setStep(step + 1)
  }

  const current = steps[step]
  return <main className="organization-setup" data-ovelle-theme="light">
    <div className="organization-setup__content">
      <div className="organization-setup__stack">
        <div className="organization-setup__progress" aria-hidden="true">
          {steps.map((item, index) => <span key={item.label} data-current={index === step || undefined} />)}
        </div>
        <p className="organization-setup__step">Step {step + 1} of {steps.length} / {current.label}</p>
        <h1 className="organization-setup__title" tabIndex={-1} ref={heading}>{current.title}</h1>
        <p className="organization-setup__intro">{current.intro}</p>
        <form noValidate onSubmit={advance}>
          {step < 2 ? <div className="organization-setup__fields">
            {groups[step].map(key => <Field key={key} id={`setup-${key}`} name={key}
              label={fields[key].label} placeholder={fields[key].example} autoComplete={fields[key].autoComplete}
              type={key === 'contactEmail' ? 'email' : 'text'} spellCheck={key !== 'contactEmail' && key !== 'timeZone'}
              autoCapitalize={key === 'contactEmail' || key === 'timeZone' ? 'none' : undefined} required
              maxLength={key === 'contactEmail' ? 254 : 120} value={details[key]} hint={fields[key].hint}
              error={errors[key]} supportingText={fields[key].hint ? 'visible' : 'hidden'}
              material="solid" className="organization-setup__field"
              onChange={event => {
                setDetails({ ...details, [key]: event.target.value })
                if (errors[key]) setErrors({ ...errors, [key]: undefined })
              }} />)}
          </div> : <dl className="organization-setup__summary">
            {allFields.map(key => <div key={key}><dt>{fields[key].label}</dt><dd>{details[key].trim()}</dd></div>)}
          </dl>}
          {failed && <div className="organization-setup__alert" tabIndex={-1} ref={alert} role="alert">
            <strong>Creation could not be confirmed.</strong>
            <p>Retry the same request to avoid creating a duplicate. If your session isn’t passkey verified, sign out and approve this device again.</p>
          </div>}
          <div className="organization-setup__actions">
            {step > 0 && !pending.current && <Button variant="secondary" className="organization-setup__back" onClick={() => { setErrors({}); setStep(step - 1) }}>Back</Button>}
            <Button type="submit" className="organization-setup__next" surfaceClassName="organization-setup__next-surface"
              material="solid" state={busy ? 'loading' : 'default'} loadingLabel="Creating organization…">
              {failed ? 'Retry setup' : ['Continue', 'Review details', 'Create organization'][step]}
              {step < 2 && <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M3 10h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>}
            </Button>
          </div>
          <span className="ov-sr-only" role="status">{busy ? 'Creating organization…' : ''}</span>
          {step === 2 && !pending.current && <p className="organization-setup__note">Creating an organization requires a passkey-verified session.</p>}
        </form>
      </div>
    </div>
    <div className="organization-setup__art" aria-hidden="true">
      <img src={communityLoop} alt="" width="1380" height="1480" />
      <span className="organization-setup__art-label">Ovelle Studio / 001</span>
      <div className="organization-setup__caption"><strong>The Community Loop</strong><span>Three parts. One shared purpose.</span></div>
    </div>
  </main>
}
