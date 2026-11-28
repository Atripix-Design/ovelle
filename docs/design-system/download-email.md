# Ovelle desktop download email

The mobile download form emails a link to the desktop chooser in the same environment. The email is transactional, keeps the download action above the photograph, and has a plain-text alternative. No account is created.

## Design references

| Reference | Applied to Ovelle |
| --- | --- |
| [New York Magazine app introduction](https://reallygoodemails.com/emails/introducing-our-new-app) | The publication/product name stands alone before the app handoff. |
| [YellowBag app download](https://reallygoodemails.com/emails/download-our-app/info) | A single-column composition readable from a narrow mobile inbox. |
| [Hootsuite app download](https://reallygoodemails.com/emails/download-free-mobile-app/info) | A platform-specific instruction makes the next step explicit. |
| [Prospa app launch](https://reallygoodemails.com/emails/the-prospa-app-has-launched-/info) | Use a visual related to the work people do with the app, separated from the download action. |
| [WeTransfer download email](https://wetransfer.com/resources/share-files-via-email/share-files-without-email-attachment) | One primary link to a hosted download page, without an installer attachment. |

Ovelle uses the site's canvas, brand blue, text and border tokens. Its 464px layout, 20px outer shell, 16px inner surfaces and pill action echo the mobile form without taking over the reading pane. The compact footer identifies Ovelle and links to the matching site's homepage, volunteer features, and download FAQ in both HTML and plain text. The glass look comes from a pale blue rim and a translucent inner fill with a solid white fallback. The button has a solid background even when the client drops gradients or rounding.

The single photo is [Volunteer People Picking Up Trash and Plastics](https://www.pexels.com/photo/volunteer-people-picking-up-trash-and-plastics-7656742/) by Thirdman, under the [Pexels License](https://www.pexels.com/license/). Ovelle hosts a fixed crop of the stock JPEG with no third-party pixel or recipient-specific image URL.

The decorative email tide is a static transparent PNG derived from the three original ink paths in the [official Penpot desktop export](migration/site-footer/penpot-desktop-exact.svg), group `shape-f4b2b2fe-96aa-80e1-8009-0252e46f3833`. The paths were rasterized, trimmed to the alpha bounds and resized proportionally to 896 × 187. The wave meets the bottom edge of the same footer panel that holds the tagline, product description, navigation, and receipt note. The panel uses a solid fallback color in clients that block remote images or do not render background artwork. All footer text and links stay live. The website's procedural tide and motion control are unchanged.

## Deployment

| Environment | Sender | Destination |
| --- | --- | --- |
| Development | `downloads@dev.mail.ovelle.org` | `https://dev.ovelle.org/#download` |
| Production | `downloads@mail.ovelle.org` | `https://ovelle.org/#download` |

The sender's subdomain must be active in Cloudflare Email Sending, and the environment's D1 database must have migration `0001_download_email_limits.sql`. After a deploy, submit the real mobile form with the controlled Outlook address, confirm the delivered message in Outlook, and verify the image and download actions follow the correct environment. An HTTP success only confirms that the provider accepted the message.
