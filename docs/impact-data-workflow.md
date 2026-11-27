# Proposed program-impact data workflow

October 18, 2026. This develops how program results could be collected for the
confirmed [reporting feature](feature-list.md#reporting). Collection behavior and
measure definitions below remain proposals. This is not an implemented feature,
approval of beneficiary case management or a claim that activity totals establish
long-term community impact.

## 1. Define each program's measures

An authorized program owner defines what staff should record and how it will be
interpreted. Use a versioned measure definition rather than arbitrary dashboard
labels. Proposed fields:

| Field | Purpose |
| --- | --- |
| Name and type | Distinguish an activity output, observed outcome and resource/input measure. |
| Definition and unit | State exactly what one count means; keep households, people, meals and kilograms separate. |
| Recording scope | Specify program, location, occurrence or reporting period and whether it spans shifts. |
| Collection method | Describe the source, collection time and responsible staff role. |
| Validation | Define number type, permitted range, required explanation and when zero is valid. |
| Aggregation | State sum, latest value, weighted rate or non-additive behavior and required denominators. |
| Evidence and review | Define acceptable evidence, estimated versus observed status and acceptance responsibility. |
| Version and effective date | Preserve interpretation of older results when definitions change. |

For a food distribution, an initial output could be "household distributions
completed at this occurrence," measured from the distribution tally. The definition
must explain whether a household receiving two packages is one distribution or two.
This counts service occasions; it does not establish distinct households across dates.

An observed outcome such as improved food access requires a separately designed
measurement method and follow-up. Do not infer it from attendance, volunteer hours,
donations or distributions alone. Dedicated surveys remain a separate scope decision.

## 2. Assign collection responsibility before service

Attach applicable measure definitions to the activity or reporting period. Name a
collector and reviewer and explain when results are due. Different shifts working
at one distribution should contribute to one activity-level result or explicitly
partitioned subtotals, not each claim the whole event's output.

Show the definition and instructions at entry. Do not require every volunteer to
submit the same result, or ask volunteers to supply beneficiary details as part
of their service-hour submission. Volunteer form answers are not impact evidence.

## 3. Capture the result

At closeout, an authorized collector enters the value, applicable date/period,
program, location and occurrence where relevant. Preserve the definition version,
source, collector, entry time and a concise evidence note. Where needed, attach a
private source document through the existing document capability and access rules.

Distinguish observed results from estimates and record the estimation method.
Allow a result to be marked not collected, not applicable or awaiting source data;
none means zero. For rates, retain numerator and denominator as well as the display
percentage. Record zero only when collection actually establishes zero.

Propose draft, submitted, needs clarification, accepted and superseded states.
The entry route could be a structured closeout form; a general survey builder,
automatic external-data integration and public photo collection are not assumed.

## 4. Validate and review

Validate the unit, reporting scope, required evidence and definition version. Reject
impossible inputs such as negative distribution counts; flag unusual values for
review rather than assuming every large value is wrong. Save the submission once
on retry and detect existing results for the same measure and reporting scope.

The reviewer checks whether multiple teams submitted overlapping counts. If the
morning and afternoon shifts both report 180 for the same full-day distribution,
resolve the overlap instead of summing 360. If they separately counted 80 and 100
non-overlapping distributions under the same definition, their accepted subtotals
may produce 180 with their sources retained.

Record acceptance, clarification or explained adjustment with author and time.
A collector's submission, closed attendance record or approved service hours does
not automatically accept the program result. Define whether small organizations
may permit the same person to collect and accept, with visible authorship.

## 5. Report accepted results with their limits

Reporting reads accepted current result versions within the user's access scope.
Show the measure's unit, definition/version, dates and collection coverage. Keep
estimates identifiable and separate or clearly labeled according to report policy.
An incomplete period must not appear to be fully measured.

Example: an occurrence has 15 attendees, 42 approved service hours and 180 accepted
household distributions. Display three distinct measures. Linking the result to 15
attendance records must not multiply the distribution count by 15. Do not invent
per-person attribution from an aggregate event result.

Sum only compatible, non-overlapping results. Never add households to people or
average percentages without their denominators. A changed measure definition may
require separate series rather than joining old and new values without explanation.
Repeated service occasions are not unique beneficiaries. Cross-date deduplication
requires its own approved identity method and privacy design; it is not implied here.

## 6. Correct results and preserve history

If the accepted tally changes from 180 to 172, submit a correction linked to the
original with reason and evidence. After acceptance, replace its contribution in
current totals while retaining the original, reviewer and correction history.
Do not add 172 as another result alongside 180.

Reports show generation time and relevant corrections. Previously downloaded
reports remain historical copies and are not silently updated. Program-result
corrections do not rewrite attendance, approved hours, signed evidence or donations.

## 7. Limit sensitive information

Prefer aggregate counts and minimal evidence. Beneficiary names, health details,
addresses and identifiable photographs are not needed for a basic distribution
count. Do not place support cases, accommodation requests or incident narratives
in routine program-result evidence or broadly available exports.

Restrict raw evidence separately from aggregate reporting. Define access, retention,
small-group disclosure handling and external publication approval before collecting
sensitive data. Public aggregate reporting is not authorized simply because staff
can generate an internal report.

## Proposed validation scenarios

| Scenario | Expected planning outcome |
| --- | --- |
| No tally was taken | Mark not collected; do not show zero or imply complete coverage. |
| Two shifts submit the same full-day count | Resolve the duplicate scope before acceptance or aggregation. |
| A report joins results to volunteer attendance | Count the activity result once, independently of volunteer count. |
| Two events serve some of the same households | Report distributions, not unique households, absent an approved method. |
| A result is estimated | Preserve its method and label; do not present it as an observed count. |
| Two locations report rates | Use compatible numerators/denominators rather than averaging displayed percentages. |
| An accepted result is corrected | Replace its current contribution with the accepted revision and retain history. |

## Decisions before implementation

Select initial program types and measure templates with a nonprofit. Confirm
collectors, reviewers, reporting scope, missing-data treatment, source evidence,
aggregation and correction policy. Decide separately whether later outcome studies,
surveys or beneficiary-level records belong in Ovelle. Validate a complete sample
report against the original activity records before implementing a dashboard.
