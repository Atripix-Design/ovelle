# Proposed nonprofit admin workflow

October 17, 2026; expanded October 18, 2026. This walkthrough complements the [feature list](feature-list.md),
[coordinator workflow](coordinator-workflow.md),
[volunteer workflow](volunteer-workflow.md) and
[group leader workflow](group-leader-workflow.md).

Organization setup, coordinator invitations and permissions, operating policies,
and staff handoffs are confirmed feature scope. This describes intended product
behavior, not implemented functionality. Detailed screens, defaults, reporting
and optional integrations remain proposals unless separately confirmed.

The admin establishes the organization, staff access and operating policies;
coordinators manage day-to-day volunteer activity within their responsibilities.

## 1. Create the organization

Enter the nonprofit's name, contact details, time zone and branding. Establish
the initial organization owner and assign additional administrators as needed
through a controlled invitation/authorization process. Define ownership
verification and recovery before implementation. Organization creation does not
establish verified nonprofit status or provider eligibility.

## 2. Set up programs and locations

Create programs such as food distribution, community cleanups or tutoring, then
add their service locations. Use these to organize activities and assign staff
responsibilities. Programs and records belong to the organization, not to the
staff member who created them.

## 3. Define volunteer requirements

Configure organization-wide requirements and additional requirements by program
or volunteer role. Set document versions, renewal periods and steps requiring
staff review. Avoid requiring every qualification for every volunteer. Preserve
the exact version associated with each signed document.

## 4. Invite coordinators and assign responsibilities

Invite staff, track acceptance and assign their program/location scope. Grant
explicit responsibilities, for example:

| Responsibility | Example access |
| --- | --- |
| Scheduling | Create activities, manage capacity and assign volunteers. |
| Onboarding | Review applicable requirements and readiness evidence. |
| Attendance | Record participation and make explained corrections. |
| Hour approval | Review submissions and approve service hours. |
| Group management | Confirm bookings and appoint authorized group leaders. |
| Finance | Manage donations, refunds and permitted financial records. |
| Volunteer support | Own routine follow-ups and hand off unresolved requests. |
| Accommodations | Review requests and share minimum practical instructions with relevant staff. |
| Incidents | Triage restricted concerns, escalate and record resolution within explicit access. |
| Program results | Collect or accept program measures under separately defined permissions. |

These are proposed permission groupings, not a finalized role model. Access to
private documents, finance or service connections requires relevant authorization.
An invite does not grant access before acceptance by the intended account;
coordinators cannot broaden their own permissions.

## 5. Configure operating policies

Decide how registrations become confirmed assignments, when unused group places
are released, who approves booking changes and how replacement offers work.
Establish review and correction rules for service hours. Define support ownership
and response targets, an incident escalation contact and alternate recipient, and
accommodation review/sharing rules. Define day-of critical-role decisions and
controlled fallback authority without assuming offline synchronization.
Coordinators operate within these policies; program/role overrides must be
explicitly defined.

Record policy changes, who made them and their effective scope. Define effects
on existing bookings without silently changing historical approvals or signed
documents. The detailed configuration interface and available automation remain
open for design.

## 6. Connect optional services

Where the organization chooses, configure email/domain verification and calendar
invitation delivery; connect its own payment account for donations and payments.
Show connection status and who can manage it. Custom-domain email setup remains
an integration proposal, and providers and onboarding flows are not yet selected.
Failure or disconnection should have an explicit operational status. SMS remains
excluded.

## 7. Review readiness to launch

Proposed launch review: confirm that programs have responsible coordinators,
required documents are available and staff permissions are appropriate. Walk
through a sample volunteer journey before publishing opportunities through the
chosen signup experience. Opportunity publishing is confirmed; website embeds and
a dedicated launch checklist remain proposals.

## 8. Oversee ongoing operations

A proposed overview surfaces unfilled critical roles, onboarding awaiting review,
unreviewed hours and activities without a responsible coordinator. Include overdue
support and unassigned follow-ups within the viewer's access; surface restricted incident or
accommodation work only to explicitly authorized staff. Investigate
or reassign work within the admin's authority. This view should support oversight
without requiring admins to approve every routine coordinator action.

## 9. Manage staff changes and handoffs

Change responsibilities, arrange temporary coverage or revoke access when someone
leaves. Transfer upcoming activities, pending reviews, support follow-ups and group
contacts to an eligible replacement. Reassign incident/accommodation work only to
someone with the required restricted permissions; show work awaiting assignment
if no replacement is ready.
Revocation must not depend on completing the handoff. Define session invalidation
and coverage end dates before implementation.

Keep historical authorship, attendance edits and approval decisions associated
with the staff member who actually performed them. Define ownership succession
and safeguards against leaving the organization without administrative access.

## 10. Review organizational records

Proposed reporting lets authorized staff review participation, approved service
hours, program outcomes and financial activity with distinct definitions and units.
Periodically review staff access, document requirements and service connections.
Reporting and exports are confirmed. The proposed
[impact-data workflow](impact-data-workflow.md) defines program measures, assigns
collectors/reviewers and separates accepted results from missing, estimated or
superseded values. Confirm definition versions, evidence, reporting coverage and
aggregation before relying on totals. Incident counts and sensitive support data
must not enter ordinary reporting simply because they exist in the organization.
Interfaces and review scheduling remain to be designed.

## Proposed admin home screen

Focus on organization health, coordinator responsibilities, pending decisions and
service connections. Dashboard layout and alert rules remain open. Activities and
records must remain with the organization when the responsible person changes.
