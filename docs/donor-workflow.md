# Proposed donor workflow

October 17, 2026. This walkthrough complements the [feature list](feature-list.md)
and [nonprofit admin workflow](nonprofit-admin-workflow.md). Donations/payments,
donor self-service, recurring donation controls and donation history are confirmed
feature scope. This describes intended product behavior, not implemented
functionality; detailed screens, providers and provider-dependent controls remain
proposals until designed and verified.

The donor's path is: understand the purpose, choose a donation, pay, receive the
verified outcome and manage future giving through secure access.

## 1. Open the nonprofit's donation page

Follow a link from its website, campaign or event. Show the nonprofit's identity,
campaign purpose and whether giving supports a program or general operations.
The exact public-page and embedding experience remains to be designed.

## 2. Choose the donation

Select amount, currency and one-time or recurring giving. For recurring giving,
show frequency, first payment date and cancellation terms before confirmation.
Any optional contribution toward processing costs must be explicit; that option
is not separately confirmed scope.

## 3. Enter details and preferences

Collect information needed for payment and confirmation. If offered, make
newsletter consent and public recognition separate choices. Public anonymity
does not mean anonymity to the nonprofit or payment provider. Recognition and
marketing interfaces remain proposals.

## 4. Review and pay

Show the total, currency, recipient and recurring terms, then collect payment
through the selected provider. Proposed initial giving does not require creating
an Ovelle password; account-linking and authentication details remain open.
Ovelle retains provider references rather than raw card details.

## 5. Receive the payment outcome

Show success, processing or failure based on verified provider state, not merely
the browser returning from checkout. Send confirmation after verified success.
Keep a payment confirmation distinct from a charitable tax acknowledgment; do not
promise deductibility or issue tax-related wording without separately establishing
the nonprofit's eligibility and applicable requirements.

## 6. Access secure donor self-service

Use verified sign-in or a secure management link to access only the donor's own
records for the appropriate nonprofit. Access does not require volunteer status.
Being both a donor and a volunteer must not mix permissions or make one activity
a condition of the other. Define recovery and identity/account linking before
implementation.

## 7. Manage recurring giving

See the amount, currency, frequency, status and next scheduled charge.

| Action | Information the donor needs |
| --- | --- |
| Update payment method | Which future donations will use it and whether a retry is scheduled. |
| Change amount, if supported | The new amount and effective date. |
| Pause/resume, if supported | Whether payments resume automatically and the next charge date. |
| Cancel | When future charges stop and that prior payments remain recorded. |

Cancellation is in scope; exact timing and other controls depend on the selected
provider integration. Show requested versus completed changes accurately and
reconcile provider confirmation. Cancellation does not automatically refund prior
payments. Define treatment of in-flight charges and scheduled retries before
implementation.

## 8. Handle payment failures

Explain that payment has failed and provide a secure payment-update path. Show
whether another attempt is scheduled. Updating a payment method or repeating an
action must not create a duplicate recurring commitment. Retry rules and payment
notification delivery remain to be designed.

## 9. Review history and request help

View individual transactions with their payment status, including pending payments,
refunds and disputes. Keep commitments and future charges distinct from money
received. Provide access to available confirmations and a way to contact the
nonprofit about mistakes or refunds; a refund request does not imply approval.
Downloads and charitable acknowledgments remain subject to separate scope and
eligibility decisions.

## Proposed donor home screen

Focus on active recurring donations, the next payment, payment issues and donation
history. Donor identity, recurring commitments and individual transactions remain
separate records. Public donation UX, management-link security, supported controls,
change timing and notification policies require detailed planning before build.
