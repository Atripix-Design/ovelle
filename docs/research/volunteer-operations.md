# Published volunteer-operations examples

Research checked October 17, 2026. These are publicly accessible organization
instructions, operating accounts and technology updates. They provide workflow
evidence, not access to private systems or proof of sector-wide prevalence.
Recommendations below are proposals, not approved requirements or implemented
features. Onboarding is separately confirmed in the [feature list](../feature-list.md).

## Organization examples

### Twin Cities Habitat for Humanity: group bookings and readiness

Its [Build Week Blueprint](https://www.tchabitat.org/blueprint) describes actual
VolunteerHub use: a staff member supplies a group-specific page with reserved
opportunities; each volunteer registers individually; waivers are renewed annually;
confirmation and reminder emails are automated. Group leaders and construction
staff monitor signups. Its [registration-viewing instructions](https://www.tchabitat.org/hubfs/Volunteer%20Files/Instructions%20On%20Seeing%20Event%20Registration.pdf)
show how leaders check who has registered, using limited name display.

Implication: model group reservations separately from individual registrations,
support scoped group-leader access, and show incomplete registration and waiver
requirements. A headcount alone cannot tell a coordinator who is ready to serve.

### parkrun: recurring, role-based event operations

Its [EMS guide](https://volunteer.parkrun.com/hc/en-us/articles/16857895768210-4-2-Results-Processing-and-Volunteer-Management)
describes its own mobile-optimized Event Management System, covering volunteer
management, cancellations, incident recording and results processing, with a
separate training environment. Its [roster-template instructions](https://volunteer.parkrun.com/hc/en-us/article_attachments/30134794347410)
show reusable templates, task slots and internal task labels; those labels do not
appear on the public future-volunteer page. The roster instructions are dated
October 2025; the EMS guide was updated July 2026.

Implication: use named roles and required slots, reusable event templates and a
distinction between internal operational detail and public information. Do not
assume parkrun-specific results processing belongs in Ovelle.

### Team Rubicon: readiness, availability and assignment are separate

Its February 27, 2026 [deployment-process account](https://teamrubiconusa.org/news-and-stories/inside-the-team-rubicon-deployment-process/)
describes profile completion, emergency contacts, background screening and initial
training before deployment readiness. Volunteers express availability, may need
to reconfirm it, and are selected for particular operational needs and skills;
responding does not guarantee assignment. Dispatch instructions include a meeting
point and contact, and deployments can be canceled.

Implication: distinguish eligible, interested, available, selected and confirmed.
Keep eligibility configurable: disaster-response requirements are not universal
requirements for informal volunteering groups. SMS used by this organization
does not reopen Ovelle's exclusion of SMS.

### Food Bank of Contra Costa and Solano: the coordinator's actual work

Its [August 2024 coordinator job description](https://www.foodbankccs.org/wp-content/uploads/2024/08/Job-posting-Volunteer-Services-Coordinator-0824.pdf)
names Salesforce, HandsOn Connect and SharePoint. Duties include helpdesk email,
recurring corporate/civic/school/church group schedules, monitoring newly created
groups, reviewing no-shows, producing daily/weekly schedules and sign-in sheets,
and recording attendance. This is historical evidence of documented duties and
tools, not verification of its October 2026 software configuration.

Implication: include coordinator-assisted workflows, printable rosters, attendance
corrections and no-show follow-up. Allow existing office/document tools to coexist
with Ovelle; a real operation may span several systems and departments.

### Food Rescue US: recurring commitments and replacement coverage

Its [app explanation and FAQ](https://foodrescue.us/our-app/) describe volunteers
claiming scheduled pickups and deliveries, following task directions, canceling
in the app and adopting recurring rescues. It requests advance cancellation notice
so someone else can complete the rescue.

Implication: distinguish a recurring commitment from its individual occurrences;
handle absences and replacement coverage without removing the whole commitment.
Route/dispatch operations should be a separately scoped specialty if pursued.

### Food Rescue Hero: concrete product changes from operational needs

Its [2024 technology retrospective](https://foodrescuehero.org/2024-a-year-of-food-rescue-hero-platform-updates/),
published January 2025, explains draft/save-later workflows when dispatchers lack
details, copying similar rescues to reduce repeated entry, searching past and
upcoming rescues, multi-stop routes, and photo-based delivery confirmation.
This is the platform operator's own account, also serving a promotional purpose;
its claimed impact improvements are not independently validated here.

Implication: interrupted work, duplication, search and completion evidence deserve
attention alongside integrations. These support daily operations; food-routing
features should not be generalized into all volunteer programs.

## Recommended realism checks for Ovelle

Before implementation, validate these scenarios with a coordinator at a prospective
organization; the sources establish examples, not representative market research:

1. A group reserves places before all individual volunteers register.
2. A registered person still needs a waiver or role-specific training.
3. A recurring volunteer misses one date and a replacement is needed.
4. An event has enough people overall but lacks someone qualified for a key role.
5. A coordinator registers a person after a phone call or corrects attendance.
6. A volunteer cancels, does not show, or arrives without completed requirements.
7. Staff need a printable roster and a report with clear attendance/hour definitions.

Prioritize a usable scheduling/onboarding/attendance workflow before expanding
the number of integrations. Preserve confirmed calendar, payment and document
scope while evaluating implementation order against real coordinator needs and
the supplied rubric.
