import { EmailDownloadLink, HeroWorkflowScene, MobileWorkflow, PinnedWorkflow, WorkflowSection } from '@ovelle/ui';
import type { EmailDownloadState, WorkflowStage } from '@ovelle/ui';
const states: EmailDownloadState[] = ['default','focused','sending','sent','invalid','error','disabled'];
const stages: WorkflowStage[] = ['find','enrich','follow-up'];
export default function WebsiteVariants() {
  return <section className="website-variants"><h2>Website source states</h2><div className="preview-state-grid">
    {states.map(state => <div key={state} data-website-state={state}><h3>Email · {state}</h3><EmailDownloadLink state={state} defaultEmail={state === 'default' ? '' : state === 'invalid' ? 'alex@' : 'alex@example.com'} onSend={async () => {}}/></div>)}
    {stages.map(stage => <div key={stage} data-website-stage={stage}><h3>Workflow · {stage}</h3><MobileWorkflow stage={stage}/><HeroWorkflowScene stage={stage}/><HeroWorkflowScene stage={stage} size="compact"/><WorkflowSection stage={stage} layout="mobile"/></div>)}
  </div><div>{stages.map((stage,index) => <div key={stage} data-workflow-progress-source={stage} style={{width:1440}}><h3>Scroll progress · {stage} · midpoint</h3><PinnedWorkflow stage={stage} progress={(index + .5) / 3} presentation="stage"/></div>)}</div></section>;
}
