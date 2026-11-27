import { useEffect, useState } from 'react';
import { Button, DeviceAwareDownloadCTA, EmailDownloadLink, FAQRow, FeatureCard, HeroWorkflowScene, IconAction, LoadingBoundary, MobileWorkflow, OvelleProvider, PinnedWorkflow, SectionLabel, SiteFooter, SiteNavigationDesktop, SiteNavigationMobile, WorkflowPreview, ovelleRepositoryUrl, programFeatures, websiteImages } from '@ovelle/ui';
import type { DesktopRelease, WorkflowStage, SiteFooterLinkGroup } from '@ovelle/ui';
import './home.css';
import { useGitHubStars } from './useGitHubStars';

const environment = import.meta.env.VITE_APP_ENV === 'production' ? 'production' : 'development';
/** Source prototype SCROLL_ANIMATE: 350ms, cubic-bezier(0,0,.58,1). */
function scrollToSection(id: string) {
  const target = document.getElementById(id); if (!target) return;
  const from = scrollY, to = target.getBoundingClientRect().top + from;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { scrollTo(0, to); target.focus({ preventScroll: true }); return; }
  const start = performance.now(); let frame = 0;
  const cancel = () => { cancelAnimationFrame(frame); removeEventListener('wheel', cancel); removeEventListener('touchstart', cancel); removeEventListener('keydown', cancel); };
  addEventListener('wheel', cancel, { passive: true, once: true }); addEventListener('touchstart', cancel, { passive: true, once: true }); addEventListener('keydown', cancel, { once: true });
  const step = (now: number) => { const t = Math.min(1, (now - start) / 350); let a = 0, b = 1; for (let i = 0; i < 14; i++) { const u = (a + b) / 2; const x = 3 * (1 - u) * u * u * .58 + u * u * u; if (x < t) a = u; else b = u; } const u = (a + b) / 2, eased = 3 * (1 - u) * u * u + u * u * u; scrollTo(0, from + (to - from) * eased); if (t < 1) frame = requestAnimationFrame(step); else { cancel(); target.focus({ preventScroll: true }); } }; frame = requestAnimationFrame(step);
}
const footerProduct: SiteFooterLinkGroup = { label: 'Explore', links: [
  { label: 'How it works', href: '#workflow' },
  { label: 'Volunteer features', href: '#connected' },
  { label: 'Desktop download', href: '#download' },
] };
const footerResources = (desktop: boolean): SiteFooterLinkGroup => ({ label: 'Resources', links: [
  { label: 'Questions', href: '#questions' },
  ...(!desktop ? [{ label: 'Account sign-in', href: '/account/sign-in' }] : []),
  { label: 'GitHub', href: ovelleRepositoryUrl },
] });

export default function Home({ desktop = false, emailSender, loadReleases }: { desktop?: boolean; emailSender?: (email: string) => Promise<void>; loadReleases?: () => Promise<DesktopRelease[]> }) {
  const stars = useGitHubStars();
  const [compact, setCompact] = useState(() => matchMedia("(max-width:350px)").matches);
  useEffect(() => { const q=matchMedia("(max-width:350px)"); const change=()=>setCompact(q.matches); q.addEventListener("change",change); return ()=>q.removeEventListener("change",change); }, []);
  const [heroStage, setHeroStage] = useState<WorkflowStage>('find'), [workflowStage, setWorkflowStage] = useState<WorkflowStage>('find');
  const [releases, setReleases] = useState<DesktopRelease[]>([]), [loading, setLoading] = useState(!desktop || !!loadReleases), [releaseError, setReleaseError] = useState(false);
  useEffect(() => { if (desktop && !loadReleases) return; const controller = new AbortController(); const catalog = loadReleases ? loadReleases() : fetch('/api/releases', { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('catalog'); const result = await response.json(); if (!Array.isArray(result.releases)) throw new Error('catalog'); return result.releases as DesktopRelease[]; }); catalog.then(result => { if (!controller.signal.aborted) setReleases(result); }).catch(error => { if (error.name !== 'AbortError' && !controller.signal.aborted) setReleaseError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [desktop, loadReleases]);
  const explore = (stage: WorkflowStage) => { setWorkflowStage(stage); scrollToSection('workflow'); };
  const links = [{ label: 'Home', href: '#home', current: true }, { label: 'Features', href: '#connected' }, { label: 'Download', href: '#download' }];
  return <OvelleProvider theme="light" glassFrost={35}><div className="home" data-environment={environment} onClick={event => { const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]'); if (anchor?.hash && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); scrollToSection(anchor.hash.slice(1)); } }}>
    <main id="home" tabIndex={-1}>
    <section className="home-hero" aria-label="Meet Ovelle">
      <img className="home-coast-desktop" src={websiteImages.coast} alt="" fetchPriority="high"/>
      <div className="home-coast-mobile" aria-hidden="true"><img className="home-coast-base" src={websiteImages.mobileCoast} alt=""/><div className="home-coast-wash"/><img className="home-coast-middle" src={websiteImages.coastMiddle} alt=""/><img className="home-coast-bottom" src={websiteImages.coastBottom} alt=""/><img className="home-coast-left" src={websiteImages.coastCardLeft} alt=""/><img className="home-coast-right" src={websiteImages.coastCardRight} alt=""/><div className="home-coast-edge" style={{ maskImage: `url(${JSON.stringify(compact ? websiteImages.compactCoastRightMask : websiteImages.coastRightMask)}),url(${JSON.stringify(compact ? websiteImages.compactCoastRightFeather : websiteImages.coastRightFeather)})` }}><img src={websiteImages.coastRight} alt=""/></div></div>
      <SiteNavigationDesktop className="home-desktop-navigation" material="liquid-glass" brand="ovelle" links={links} githubStarCount={stars.count} githubStarsLoading={stars.loading} action={<Button material="liquid-glass" onClick={() => scrollToSection("download")}>Get Ovelle</Button>}/>
      <SiteNavigationMobile className="home-mobile-navigation" material="liquid-glass" brand="ovelle" links={links} githubStarCount={stars.count} githubStarsLoading={stars.loading}/>
      <div className="home-hero-copy"><h1>Better relationships.<br/>Less busywork.</h1><p>Bring your contacts, conversations, and next steps together with Ovelle.</p><div className="home-hero-actions"><Button onClick={() => scrollToSection("download")}>Get Ovelle</Button><Button material="liquid-glass" variant="secondary" onClick={() => scrollToSection("workflow")}>Learn more</Button></div></div>
      <div className="home-hero-desktop-scene"><WorkflowPreview material="liquid-glass" stage={heroStage} onStageChange={setHeroStage}/><small>Hover to reveal volunteer partner context</small></div>
      <HeroWorkflowScene size={compact ? "compact" : "regular"} className="home-hero-mobile-scene" stage={heroStage} onStageChange={setHeroStage} onExplore={explore}/>
      <div className="home-demo-action"><IconAction material="liquid-glass" label="See Ovelle in action" onClick={() => scrollToSection('workflow')}/><Button material="liquid-glass" variant="secondary" onClick={() => scrollToSection("workflow")}>See Ovelle in action</Button></div>
    </section>
    <div id="workflow" tabIndex={-1} className="home-workflow-anchor"><PinnedWorkflow className="home-desktop-workflow" onExplore={() => scrollToSection('connected')} stage={workflowStage} onStageChange={setWorkflowStage} material="liquid-glass"/><MobileWorkflow className="home-mobile-workflow" stage={workflowStage} onStageChange={setWorkflowStage} onExplore={() => scrollToSection('connected')}/></div>
    <section id="connected" tabIndex={-1} className="home-connected"><header className="home-connected-heading"><SectionLabel>Connected</SectionLabel><div><h2>Your volunteer program, in one place.</h2><p>Profiles, service opportunities, schedules, and participation records—connected.</p></div></header><div className="home-program-photo"><img src={websiteImages.riverside} alt="Volunteers cleaning up the riverside" loading="lazy"/><FeatureCard className="home-opportunity-card" material="liquid-glass" title="Service opportunities" href="#companion" linkLabel="Explore coordination">Bring scheduling, capacity, and volunteer follow-up into one workflow.</FeatureCard></div><div className="home-feature-cards">{programFeatures.map(feature => <FeatureCard key={feature.title} title={feature.title} href="#download" linkLabel={feature.action}>{feature.body}</FeatureCard>)}</div><div className="home-program-mobile">{programFeatures.map(feature => <FeatureCard key={feature.title} density="summary" title={feature.title}>{feature.body}</FeatureCard>)}<Button variant="quiet" tone="blue" onClick={() => scrollToSection("download")}>Get Ovelle</Button></div></section>
    <section id="companion" tabIndex={-1} className="home-companion"><header><SectionLabel>Desktop companion</SectionLabel><h2>A helpful companion. A reason for every suggestion.</h2><p>Review the evidence before assigning. Every suggestion connects back to your records.</p></header><div className="home-companion-story"><div className="home-companion-photo"><img src={websiteImages.companion} alt="Volunteers reviewing a suggestion together" loading="lazy"/></div><div className="home-companion-evidence"><FeatureCard title="Review before assigning" href="#download" linkLabel="Get Ovelle">Consider volunteer interests, availability, and the places open for an opportunity.</FeatureCard><p>Confirm records are current before assigning.</p></div></div></section>
    <section id="questions" tabIndex={-1} className="home-questions"><SectionLabel>Questions</SectionLabel><h2>A few things you might be wondering.</h2><FAQRow number="01" question="How do I install Ovelle?" answer="On Mac, open the download and move Ovelle.app to Applications. Older ZIP downloads need to be unzipped first. On Windows, open the downloaded EXE."/><FAQRow number="02" question="Can I explore Ovelle on the web?" answer="Ovelle shares its component system across the website and desktop experience."/><FAQRow number="03" question="Why should I choose you?" answer="Ovelle brings volunteer coordination and follow-up together in one desktop workspace for Mac and Windows."/></section>
    <section id="download" tabIndex={-1} className="home-download"><div className="home-download-options"><LoadingBoundary loading={loading} label="Loading available desktop downloads"><DeviceAwareDownloadCTA releases={releases.filter(release => release.available)}/></LoadingBoundary>{!loading && !releases.some(release => release.available) && <p role="status" className="home-release-note">{releaseError ? "Downloads are temporarily unavailable. Please try again later." : "No desktop builds are available yet."}</p>}</div><EmailDownloadLink className="home-download-mobile" onSend={emailSender ?? (async email => { const response = await fetch("/api/download-email", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); if (!response.ok || !(await response.json()).sent) throw new Error('Email delivery unavailable'); })}/></section>
    </main>
    <SiteFooter homeHref="#home" groups={[footerProduct, footerResources(desktop)]}/>
  </div></OvelleProvider>;
}
