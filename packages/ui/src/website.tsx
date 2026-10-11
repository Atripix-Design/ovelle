import { useId, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { Button, DownloadAction, DownloadCard, FeatureCard, Field, FilterChip } from './index.js';
import { useMaterial } from './material.js';
import type { MaterialProps } from './material.js';

type Visual = MaterialProps & HTMLAttributes<HTMLElement>;
export const programFeatures = [
  { title: 'Volunteer records', body: 'Keep contacts, interests, skills, and availability together for each volunteer.', action: 'Explore volunteers' },
  { title: 'Opportunities and schedules', body: 'Coordinate service activities, capacity, assignments, and upcoming shifts.', action: 'Explore opportunities' },
  { title: 'Participation and reports', body: 'Track attendance and service hours. Filter reports by volunteer, opportunity, and date.', action: 'Explore reports' },
] as const;
export type ProgramOverviewProps = Visual & { opportunityHref?: string; programHref?: string; onOpportunityClick?: () => void; onProgramClick?: () => void };
export function ProgramOverview({ opportunityHref = '#companion', programHref = '#download', onOpportunityClick, onProgramClick, material, glassFrost, reduceTransparency, className, style, ...rest }: ProgramOverviewProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'program-overview');
  return <section {...rest} {...visual} aria-label="Volunteer program overview"><FeatureCard density="summary" title="Riverside clean-up">Friday · 9:00–12:00<br/>8 of 20 places open<br/>Example opportunity</FeatureCard><Button variant="quiet" tone="blue" onClick={() => { if (onOpportunityClick) onOpportunityClick(); else window.location.hash = opportunityHref; }}>View opportunity</Button>{programFeatures.map(feature => <FeatureCard key={feature.title} density="summary" title={feature.title}>{feature.body}</FeatureCard>)}<Button variant="quiet" tone="blue" onClick={() => { if (onProgramClick) onProgramClick(); else window.location.hash = programHref; }}>Explore volunteer program</Button></section>;
}
export type EmailDownloadState = 'default' | 'focused' | 'sending' | 'sent' | 'invalid' | 'error' | 'disabled';
export type EmailDownloadLinkProps = Visual & { state?: EmailDownloadState; defaultEmail?: string; onSend: (email: string) => Promise<void>; onStateChange?: (state: EmailDownloadState) => void; disabled?: boolean };
export function EmailDownloadLink({ state: given, defaultEmail = '', onSend, onStateChange, disabled, material, glassFrost, reduceTransparency, className, style, ...rest }: EmailDownloadLinkProps) {
  const [email, setEmail] = useState(defaultEmail), [internal, setInternal] = useState<EmailDownloadState>('default'); const inFlight = useRef(false), statusId = useId();
  const state = disabled ? 'disabled' : given ?? internal, busy = state === 'sending', sent = state === 'sent';
  const update = (value: EmailDownloadState) => { setInternal(value); onStateChange?.(value); };
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'email-download-link');
  return <section {...rest} {...visual} data-state={state} aria-busy={busy || undefined}><h2>{sent ? 'Check your inbox.' : <>Get Ovelle on<br/>your computer.</>}</h2><p>{sent ? 'Your download link is on its way. Open it on your computer to get Ovelle.' : 'We’ll email you a download link to open on your computer.'}</p><form noValidate onSubmit={async event => {
    event.preventDefault(); if (inFlight.current || state === 'disabled' || busy) return;
    if (sent) { update('default'); return; }
    const input = event.currentTarget.querySelector('input')!;
    if (!email.trim() || !input.validity.valid) { input.focus(); update('invalid'); return; }
    inFlight.current = true; update('sending');
    try { await onSend(email.trim()); update('sent'); } catch { update('error'); } finally { inFlight.current = false; }
  }}><Field material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} supportingText="hidden" label="Email address" type="email" autoComplete="email" inputMode="email" required maxLength={254} placeholder="you@example.com" value={email} disabled={busy || sent || state === 'disabled'} onChange={event => { setEmail(event.target.value); if (state !== 'default') update('default'); }} onFocus={() => { if (state === 'default') update('focused'); }} onBlur={() => { if (state === 'focused') update('default'); }} error={state === 'invalid' ? 'Enter a valid email address.' : undefined} wrapperClassName="ov-email-field" aria-describedby={state === 'error' ? statusId : undefined}/><Button material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} type="submit" disabled={state === 'disabled'} state={busy ? 'loading' : 'default'} loadingLabel="Sending link…">{sent ? 'Send another link' : state === 'error' ? 'Try again' : 'Email me the link'}</Button></form>{(sent || state === 'error') && <p id={statusId} className="ov-email-status" role={sent ? 'status' : 'alert'}>{sent ? 'Can’t find it? Check your spam folder.' : 'We couldn’t send the link. Please try again.'}</p>}</section>;
}
export interface DesktopRelease { platform: 'macOS' | 'Windows'; title: string; description: string; label: string; href: string; requirements: string; available: boolean }
export type DeviceAwareDownloadCTAProps = Visual & { releases: readonly DesktopRelease[]; device?: 'macOS' | 'Windows' | 'Other'; onDeviceChange?: (device: 'macOS' | 'Windows' | 'Other') => void };
export function DeviceAwareDownloadCTA({ releases, device: given, onDeviceChange, material, glassFrost, reduceTransparency, className, style, ...rest }: DeviceAwareDownloadCTAProps) {
  const [internal, setInternal] = useState<'macOS' | 'Windows' | 'Other'>(() => /Macintosh|Mac OS X/.test(navigator.userAgent) ? 'macOS' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'Other'); const device = given ?? internal;
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'device-download');
  return <section {...rest} {...visual}><h2>Make room for better relationships.</h2><p>Keep volunteer partners, opportunities, and next steps together.</p><div className="ov-platform-controls" role="group" aria-label="Download platform">{(['macOS', 'Windows', 'Other'] as const).map(key => <div className="ov-platform-control-slot" key={key}><FilterChip selected={device === key} onClick={() => { setInternal(key); onDeviceChange?.(key); }}>{key === 'Other' ? 'All downloads' : key}</FilterChip></div>)}</div><div className="ov-release-cards">{releases.filter(release => device === 'Other' || release.platform === device).map(release => <DownloadCard key={release.title} material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} platform={release.platform} title={release.title} requirements={release.available ? release.requirements : 'This preview build is not available yet.'} unavailable={!release.available} action={<DownloadAction target="_blank" rel="noopener noreferrer" href={release.href} label={release.label} unavailable={!release.available}/>}>{release.description}</DownloadCard>)}</div></section>;
}
