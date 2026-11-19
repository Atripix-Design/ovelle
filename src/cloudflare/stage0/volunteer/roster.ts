import type { Principal, RequestContext } from '../contracts'
import { Bindings } from '../db'
import { encodeBase64Url } from '../domain/base64url'
import { Stage0Error } from '../errors'
import { loadLiveSession } from '../auth/sessions'
import { volunteerWritePredicate } from './policy'

type RosterRow={assignmentId:string;name:string;role:string;readiness:string;checkedInAt:number|null;checkedOutAt:number|null;presence:string;presenceEventId:string|null}
type RosterCounts={expected:number;onSite:number;departed:number;canceled:number;noShow:number}
function encodeCursor(scope:string[],id:string):string{return encodeBase64Url(new TextEncoder().encode(JSON.stringify([1,...scope,id])))}
function decodeCursor(value:string,scope:string[]):string {
  try {
    if(value.length>2048 || !/^[A-Za-z0-9_-]+$/.test(value))throw new Error()
    const data:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))))
    if(!Array.isArray(data) || data.length!==6 || data[0]!==1 || scope.some((v,i)=>data[i+1]!==v) || typeof data[5]!=='string' || !data[5] || data[5].length>256 || /\p{Cc}/u.test(data[5]))throw new Error()
    const id=data[5] as string
    if(encodeCursor(scope,id)!==value)throw new Error()
    return id
  } catch {throw new Stage0Error('invalid_input')}
}

/** Operational status excludes private evidence. Headcounts cover the entire
 * roster and share a transactional snapshot with the requested page. */
export async function readRoster(ctx: RequestContext, principal: Principal, organizationId: string, occurrenceId: string, query: Record<string, string>) {
  const { programId, locationId, cursor } = query
  if (![programId, locationId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\p{Cc}/u.test(value))) throw new Stage0Error('invalid_input')
  const scope=[organizationId,occurrenceId,programId,locationId],position=cursor===undefined?undefined:decodeCursor(cursor,scope)
  await loadLiveSession(ctx, principal)
  const now=ctx.clock.now(),b = new Bindings()
  const policy = volunteerWritePredicate(b, principal, organizationId, {kind:'program_location',programId,locationId}, 'attendance.manage', now)
  const occurrence = await ctx.db.prepare(`SELECT id,title,starts_at AS startsAt,ends_at AS endsAt FROM volunteer_occurrences WHERE organization_id=${b.add(organizationId)} AND id=${b.add(occurrenceId)} AND program_id=${b.add(programId)} AND location_id=${b.add(locationId)} AND (${policy})`).bind(...b.values).first<{id:string;title:string;startsAt:number;endsAt:number}>()
  if (!occurrence) throw new Stage0Error('not_found')
  // Each statement rechecks authority. The batch keeps counts and page aligned.
  const rows = new Bindings(),allowed = volunteerWritePredicate(rows, principal, organizationId, {kind:'program_location',programId,locationId}, 'attendance.manage', now)
  // Resolve the position inside this occurrence so names do not enter URLs.
  const after=position?`AND EXISTS(SELECT 1 FROM volunteer_assignments previous JOIN volunteer_people prior_person ON prior_person.organization_id=previous.organization_id AND prior_person.id=previous.person_id WHERE previous.organization_id=${rows.add(organizationId)} AND previous.occurrence_id=${rows.add(occurrenceId)} AND previous.id=${rows.add(position)} AND (p.display_name>prior_person.display_name OR (p.display_name=prior_person.display_name AND a.id>previous.id)))`:''
  const page=ctx.db.prepare(`SELECT a.id AS assignmentId,p.display_name AS name,r.name AS role,
    coalesce(v.state,'pending') AS readiness,t.checked_in_at AS checkedInAt,t.checked_out_at AS checkedOutAt,
    CASE WHEN t.checked_out_at IS NOT NULL THEN 'departed' WHEN t.checked_in_at IS NOT NULL THEN 'on_site' WHEN presence.state='no_show' THEN 'no_show' ELSE 'expected' END AS presence,
    presence.id AS presenceEventId
    FROM volunteer_assignments a JOIN volunteer_people p ON p.organization_id=a.organization_id AND p.id=a.person_id
    JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id
    JOIN volunteer_role_requirements r ON r.organization_id=a.organization_id AND r.occurrence_id=a.occurrence_id AND r.role_id=a.role_id
    LEFT JOIN volunteer_effective_readiness v ON v.organization_id=a.organization_id AND v.occurrence_id=a.occurrence_id AND v.role_id=a.role_id AND v.person_id=a.person_id
    LEFT JOIN volunteer_effective_attendance t ON t.organization_id=a.organization_id AND t.assignment_id=a.id
    LEFT JOIN volunteer_current_presence presence ON presence.organization_id=a.organization_id AND presence.assignment_id=a.id
    WHERE a.organization_id=${rows.add(organizationId)} AND a.occurrence_id=${rows.add(occurrenceId)} AND o.program_id=${rows.add(programId)} AND o.location_id=${rows.add(locationId)} AND a.status='confirmed' AND (${allowed}) ${after}
    ORDER BY p.display_name,a.id LIMIT 101`).bind(...rows.values)
  const counts=new Bindings(),canCount=volunteerWritePredicate(counts,principal,organizationId,{kind:'program_location',programId,locationId},'attendance.manage',now)
  const summary=ctx.db.prepare(`SELECT
    count(CASE WHEN a.status='confirmed' AND t.checked_in_at IS NULL AND coalesce(presence.state,'expected')!='no_show' THEN 1 END) AS expected,
    count(CASE WHEN a.status='confirmed' AND t.checked_in_at IS NOT NULL AND t.checked_out_at IS NULL THEN 1 END) AS onSite,
    count(CASE WHEN a.status='confirmed' AND t.checked_out_at IS NOT NULL THEN 1 END) AS departed,
    count(CASE WHEN a.status='canceled' THEN 1 END) AS canceled,
    count(CASE WHEN a.status='confirmed' AND t.checked_in_at IS NULL AND presence.state='no_show' THEN 1 END) AS noShow
    FROM volunteer_assignments a JOIN volunteer_occurrences o ON o.organization_id=a.organization_id AND o.id=a.occurrence_id
    LEFT JOIN volunteer_effective_attendance t ON t.organization_id=a.organization_id AND t.assignment_id=a.id
    LEFT JOIN volunteer_current_presence presence ON presence.organization_id=a.organization_id AND presence.assignment_id=a.id
    WHERE a.organization_id=${counts.add(organizationId)} AND a.occurrence_id=${counts.add(occurrenceId)} AND o.program_id=${counts.add(programId)} AND o.location_id=${counts.add(locationId)} AND (${canCount})`).bind(...counts.values)
  const [result,total]=await ctx.db.batch([page,summary])
  const volunteers=(result.results as RosterRow[]).slice(0,100),last=volunteers.at(-1)
  return { occurrence, volunteers, truncated:result.results.length>100, nextCursor:result.results.length>100 && last?encodeCursor(scope,last.assignmentId):null, summary:total.results[0] as RosterCounts, observedAt:now }
}
