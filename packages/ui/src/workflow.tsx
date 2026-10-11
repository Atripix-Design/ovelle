import { useEffect, useId, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Button, Field, FilterChip, SectionLabel } from './index.js';
import { FigmaAsset } from './figma-assets.js';
import { useMaterial, useOvelleSettings } from './material.js';
import type { MaterialProps } from './material.js';

export type WorkflowStage = 'find' | 'enrich' | 'follow-up';
const hoverSummary = { find: "Northlight Labs · Interested in outdoor projects", enrich: "Maya Chen · Outdoor interests and Friday availability", "follow-up": "Northlight Labs · 12 volunteers confirmed" };
const stages: WorkflowStage[] = ['find', 'enrich', 'follow-up'];
export const workflowContent = {
  find: { label: 'Partners', short: 'Partners', marker: '01 · Find partners', title: 'Find the right volunteer partners.', body: 'Connect with companies and teams whose interests fit your opportunities. Keep partner contacts and volunteering preferences in one place.', mobileBody: 'Match companies and teams to your volunteering opportunities.', action: 'Explore partners', previewTitle: 'Find partners for your next opportunity', field: 'Search volunteer partners', value: 'Local teams · Community projects', hint: 'Match companies to volunteering interests.', summary: '3 partners match this opportunity', records: [['Northlight Labs', 'Environment · 24 volunteers', 'Match'], ['Helix Studio', 'Mentoring · 12 volunteers', 'Match'], ['Tideway', 'Community · 40 volunteers', 'Review']] },
  enrich: { label: 'Relationships', short: 'People', marker: '02 · Build relationships', title: 'Know the people behind every partnership.', body: 'Bring company contacts, volunteer interests, conversations, and past activity together. Give your team the context to build lasting relationships.', mobileBody: 'Keep contacts, volunteer interests and activity together.', action: 'Explore relationships', previewTitle: 'Keep every relationship in context', field: 'Company and volunteer context', value: 'Northlight Labs', hint: 'Contacts, interests, and activity together.', summary: 'Volunteer profile, availability, and participation together', records: [['Maya Chen', 'Volunteer · Outdoor projects', 'Active'], ['Availability', 'Friday · 9:00–12:00', 'Match'], ['Participation', '12 verified service hours', 'Verified']] },
  'follow-up': { label: 'Opportunities', short: 'Events', marker: '03 · Coordinate opportunities', title: 'Turn shared interest into volunteering.', body: 'Bring the right team to the right opportunity. Keep invitations, commitments, and next steps connected so everyone knows what happens next.', mobileBody: 'Connect invitations, commitments and the next opportunity.', action: 'Explore opportunities', previewTitle: 'Coordinate the next opportunity', field: 'Next volunteering opportunity', value: 'Riverside clean-up · Friday', hint: 'Invite the team and track commitments.', summary: 'The team is ready for its next opportunity', records: [['Northlight Labs', '12 volunteers confirmed', 'Confirmed'], ['Team briefing', 'Thursday · 10:00', 'Planned'], ['Volunteer invitation', 'Ready for review', 'Draft']] },
} as const;
type Visual = MaterialProps & HTMLAttributes<HTMLElement>;
export type WorkflowPreviewProps = Visual & { stage?: WorkflowStage; onStageChange?: (stage: WorkflowStage) => void; layout?: 'desktop' | 'mobile'; showControls?: boolean; interactive?: boolean };
function StageControls({ stage, onChange, compact = false, ...material }: MaterialProps & { stage: WorkflowStage; onChange: (stage: WorkflowStage) => void; compact?: boolean }) {
  return <div className="ov-workflow-controls" data-workflow-controls data-compact={compact || undefined} role="group" aria-label="Workflow stage" onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const at = stages.indexOf(stage), next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (at + (event.key === 'ArrowLeft' ? -1 : 1) + 3) % 3;
    onChange(stages[next]); (event.currentTarget.querySelectorAll("button")[next] as HTMLButtonElement).focus();
  }}>{stages.map(key => <div className="ov-workflow-control-slot" key={key}><FilterChip {...material} selected={stage === key} onClick={() => onChange(key)}>{compact ? workflowContent[key].short : workflowContent[key].label}</FilterChip></div>)}</div>;
}
export function WorkflowPreview({ stage: given, onStageChange, layout = 'desktop', showControls = layout === "desktop", interactive = true, material, glassFrost, reduceTransparency, className, style, ...rest }: WorkflowPreviewProps) {
  const [internal, setInternal] = useState<WorkflowStage>('find'); const stage = given ?? internal;
  const data = workflowContent[stage], visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'workflow-preview');
  const [context, setContext] = useState(false);
  return <section {...rest} {...visual} data-stage={stage} data-layout={layout} aria-label="Ovelle example workflow" onPointerEnter={() => interactive && setContext(true)} onPointerLeave={event => setContext(interactive && event.currentTarget.contains(document.activeElement))} onFocusCapture={() => interactive && setContext(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setContext(false); }}>
    {showControls && <StageControls stage={stage} onChange={key => { setInternal(key); onStageChange?.(key); }} material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency}/>}
    <div className="ov-workflow-content" data-context={context || undefined}>
      <h3>{data.previewTitle}</h3>
      <div className="ov-workflow-context" hidden={layout !== "mobile"}><strong>{data.field}</strong><p>{data.value}</p><small>{data.hint}</small></div>{layout === "desktop" && <Field material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} label={data.field} value={data.value} readOnly hint={data.hint} wrapperClassName="ov-workflow-field"/>}
      <div className="ov-workflow-records">{data.records.map(([title, detail, status]) => <div className="ov-workflow-record" key={title}><strong>{title}</strong><small>{detail}</small><FilterChip material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} onClick={() => setContext(!context)} aria-label={`${title}: ${status}; show context`}>{status}</FilterChip></div>)}</div>
      <p className="ov-workflow-summary" data-context={context || undefined}><span aria-hidden={context}>{data.summary}</span><span aria-hidden={!context}>{hoverSummary[stage]}</span></p>
    </div>
  </section>;
}
export type WorkflowSectionProps = Visual & { stage?: WorkflowStage; onStageChange?: (stage: WorkflowStage) => void; layout?: 'desktop' | 'mobile'; onExplore?: (stage: WorkflowStage) => void };
export function WorkflowSection({ stage = 'find', onStageChange, onExplore, layout = 'desktop', material, glassFrost, reduceTransparency, className, style, ...rest }: WorkflowSectionProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'workflow-section'), data = workflowContent[stage];
  return <section {...rest} {...visual} data-layout={layout} data-stage={stage}><div className="ov-workflow-copy"><SectionLabel material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency}>{data.marker}</SectionLabel><h2>{data.title}</h2><p>{data.body}</p><Button material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} onClick={() => onExplore?.(stage)}>{data.action}</Button></div><WorkflowPreview stage={stage} onStageChange={onStageChange} layout={layout} material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency}/></section>;
}
export type MobileWorkflowProps = WorkflowSectionProps;
export function MobileWorkflow({ stage: given, onStageChange, onExplore, material, glassFrost, reduceTransparency, className, style, layout: _layout, ...rest }: MobileWorkflowProps) {
  const [internal, setInternal] = useState<WorkflowStage>('find'); const stage = given ?? internal, data = workflowContent[stage];
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'mobile-workflow');
  return <section {...rest} {...visual} data-stage={stage}><SectionLabel material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency}>How it works</SectionLabel><StageControls compact stage={stage} onChange={key => { setInternal(key); onStageChange?.(key); }} material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency}/><h2>{data.title}</h2><p>{data.mobileBody}</p><WorkflowPreview material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} stage={stage} layout="mobile" showControls={false}/><Button material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} onClick={() => onExplore?.(stage)}>{data.action}</Button></section>;
}
export type PinnedWorkflowProps = WorkflowSectionProps & { motion?: 'standard' | 'reduced'; presentation?: 'scroll' | 'stage' };
export function PinnedWorkflow({ stage: given, onStageChange, onExplore, motion, presentation = "scroll", material, glassFrost, reduceTransparency, className, style, layout: _layout, ...rest }: PinnedWorkflowProps) {
  const [internal, setInternal] = useState<WorkflowStage>('find'), [pin, setPin] = useState(false); const ref = useRef<HTMLElement>(null), settings = useOvelleSettings();
  const stage = given ?? internal;
  const setStage = (key: WorkflowStage) => { setInternal(key); onStageChange?.(key); };
  useEffect(() => {
    const query = matchMedia('(min-width: 1024px) and (min-height: 701px) and (prefers-reduced-motion: no-preference)');
    const update = () => setPin(query.matches && presentation === 'scroll' && motion !== 'reduced' && !settings.reduceMotion); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, [motion, presentation, settings.reduceMotion]);
  useEffect(() => {
    if (!pin) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const box = ref.current?.getBoundingClientRect(); if (!box || box.top > 0 || box.bottom < innerHeight) return; const progress = Math.max(0, Math.min(1, -box.top / (box.height - innerHeight))); const key = stages[Math.min(2, Math.floor(progress * 3))]; setInternal(key); onStageChange?.(key); }); };
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); update(); return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [pin, onStageChange]);
  const previousStage = useRef(stage);
  useEffect(() => {
    const changed = previousStage.current !== stage; previousStage.current = stage;
    if (!changed || !pin || settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Source 145:3492: Smart Animate, 400ms Ease Out. Text substitutions use a browser dissolve.
    const content = ref.current?.querySelector('.ov-workflow-section');
    const animation = content?.animate([{ opacity:0 }, { opacity:1 }], { duration:400, easing:'cubic-bezier(0,0,.58,1)' });
    return () => animation?.cancel();
  }, [stage, pin, settings.reduceMotion]);
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'pinned-workflow');
  return <section {...rest} {...visual} ref={ref} data-pinned={pin || undefined} data-presentation={presentation} data-stage={stage}><div className="ov-pinned-viewport"><header className="ov-pinned-heading"><SectionLabel>How it works</SectionLabel><h2>From first connection to shared impact.</h2><p>Find volunteer partners, build relationships, and coordinate opportunities together.</p></header><div className="ov-workflow-progress" aria-label={`Step ${stages.indexOf(stage) + 1} of 3`}>{stages.map(key => <button key={key} type="button" aria-label={workflowContent[key].label} aria-pressed={stage === key} onClick={() => { setStage(key); if (pin && ref.current) { const top = ref.current.getBoundingClientRect().top + scrollY; window.scrollTo({ top: top + (ref.current.offsetHeight - innerHeight) * stages.indexOf(key) / 3 + 1, behavior: 'instant' }); } }}/>)}</div>{pin || presentation === 'stage' ? <WorkflowSection material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} stage={stage} onStageChange={setStage} onExplore={onExplore}/> : stages.map(key => <WorkflowSection key={key} material={material} glassFrost={glassFrost} reduceTransparency={reduceTransparency} stage={key} onStageChange={next => { setStage(next); ref.current?.querySelector<HTMLElement>(`.ov-workflow-section[data-stage="${next}"]`)?.scrollIntoView({behavior:'instant',block:'start'}); }} onExplore={onExplore}/>)}<small className="ov-scroll-caption">Scroll to explore · 0{stages.indexOf(stage) + 1} / 03</small></div></section>;
}
const avatar = new URL('../assets/website/db6ec.png', import.meta.url).href;
export type HeroWorkflowSceneProps = Visual & { stage?: WorkflowStage; onStageChange?: (stage: WorkflowStage) => void; onExplore?: (stage: WorkflowStage) => void; size?: 'regular' | 'compact' };
export function HeroWorkflowScene({ stage: given, onStageChange, onExplore, size = 'regular', material, glassFrost, reduceTransparency, className, style, ...rest }: HeroWorkflowSceneProps) {
  const [internal, setInternal] = useState<WorkflowStage>('find'), [open, setOpen] = useState(false); const stage = given ?? internal, data = workflowContent[stage], ref = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) { dialog.close(); trigger.current?.focus(); } }, [open]);
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'hero-workflow-scene');
  return <section {...rest} {...visual} data-size={size} data-stage={stage}><header><Button ref={trigger} className="ov-hero-select" variant="quiet" tone="neutral" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><FigmaAsset name="ae16d.svg" darkName="hero-selector-dark.svg"/>{data.label}</Button><small>{stage === 'find' ? '3 matches' : stage === 'enrich' ? 'Profile' : 'Next step'}</small></header><div className="ov-hero-record">{stage === "find" && <img src={avatar} alt="" width={size === "compact" ? 32 : 42} height={size === "compact" ? 32 : 42}/>}<div><strong>{stage === 'enrich' ? 'Maya Chen' : 'Northlight Labs'}</strong><div className="ov-hero-record-detail"><small>{stage === 'find' ? 'Environment' : data.records[0][1]}</small></div></div>{stage === 'find' && <small className="ov-hero-volunteers">24 volunteers</small>}<FilterChip>{stage === 'find' ? 'Match' : data.records[0][2]}</FilterChip></div><Button className="ov-hero-explore" variant="quiet" surfaceClassName="ov-hero-explore-surface" onClick={() => onExplore?.(stage)}>{stage === 'find' ? 'View all 3 partners' : data.action}<FigmaAsset name="689eb.svg" darkName="25e3a.svg"/></Button><HeroStageSheet refElement={ref} open={open} stage={stage} onClose={() => setOpen(false)} onStageChange={key => { setInternal(key); onStageChange?.(key); setOpen(false); }} titleId={id}/></section>;
}
export type HeroStageSheetProps = { open: boolean; stage: WorkflowStage; onStageChange: (stage: WorkflowStage) => void; onClose: () => void; titleId?: string; refElement?: React.RefObject<HTMLDialogElement | null>; className?: string; presentation?: 'modal' | 'inline' };
export function HeroStageSheet({ open, stage, onStageChange, onClose, titleId, refElement, className, presentation = "modal" }: HeroStageSheetProps) {
  const internal = useRef<HTMLDialogElement>(null), ref = refElement ?? internal, id = useId();
  useEffect(() => { if (!refElement && presentation === "modal") { if (open && !ref.current?.open) ref.current?.showModal(); if (!open) ref.current?.close(); } }, [open, ref, refElement, presentation]);
  return <dialog ref={ref} open={presentation === "inline" ? open : undefined} data-presentation={presentation} className={['ov ov-hero-stage-sheet', className].filter(Boolean).join(' ')} aria-labelledby={titleId ?? id} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const box=e.currentTarget.getBoundingClientRect(); if (e.clientY < box.top || e.clientX < box.left || e.clientX > box.right) onClose(); } }}><header><h2 id={titleId ?? id}>Explore Ovelle</h2><Button size="compact" variant="quiet" tone="neutral" aria-label="Close stage choices" onClick={onClose}><FigmaAsset name="4916d.svg" darkName="sheet-close-dark.svg"/></Button></header><div className="ov-sheet-choices">{stages.map(key => <div className="ov-sheet-row" data-selected={stage === key || undefined} key={key}><Button variant="quiet" tone="neutral" aria-pressed={stage === key} onClick={() => onStageChange(key)}>{workflowContent[key].label}</Button><FigmaAsset className="ov-sheet-leading-icon" name={key === 'find' ? '848bb.svg' : key === 'enrich' ? '1f347.svg' : '1983e.svg'} darkName={key === 'find' ? 'sheet-users-dark.svg' : key === 'enrich' ? 'sheet-heart-dark.svg' : 'sheet-chart-dark.svg'}/><FigmaAsset className="ov-sheet-trailing-icon" name={stage === key ? '4802f.svg' : 'c052d.svg'} darkName={stage === key ? 'sheet-check-dark.svg' : 'sheet-chevron-dark.svg'}/></div>)}</div></dialog>;
}
export type WorkflowSlot = ReactNode;
