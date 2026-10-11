import type { ReactNode } from 'react';
import { DeviceAwareDownloadCTA, EmailDownloadLink, HeroStageSheet, HeroWorkflowScene, MobileWorkflow, PinnedWorkflow, ProgramOverview, WorkflowPreview, WorkflowSection } from '@ovelle/ui';
const noop = () => {};
const release = { platform: 'macOS' as const, title: 'Mac · Apple silicon', description: 'For Macs with an Apple silicon chip.', label: 'Download for Apple silicon', href: '#components', requirements: 'ZIP archive · Preview build', available: true };
export const websiteSpecimens: [string, ReactNode][] = [
  ['Workflow preview', <WorkflowPreview/>],
  ['Workflow section', <WorkflowSection/>],
  ['Pinned workflow', <PinnedWorkflow presentation="stage"/>],
  ['Hero workflow scene', <HeroWorkflowScene/>],
  ['Hero stage sheet', <HeroStageSheet presentation="inline" open stage="find" onStageChange={noop} onClose={noop}/>],
  ['Email download link', <EmailDownloadLink onSend={async () => {}}/>],
  ['Mobile workflow', <MobileWorkflow/>],
  ['Program overview', <ProgramOverview/>],
  ['Device-aware download CTA', <DeviceAwareDownloadCTA device="macOS" releases={[release, {...release, title:'Mac · Intel',description:'For Macs with an Intel processor.',label:'Download for Intel'}]}/>],
];
