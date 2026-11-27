// Static email markup mirrors the Ovelle light tokens rather than importing
// browser CSS. Outlook can render the solid surfaces if it strips gradients.
export function downloadEmailContent(origin: 'https://ovelle.org' | 'https://dev.ovelle.org') {
  const url = `${origin}/#download`
  const image = `${origin}/email/ovelle-volunteer-cleanup.jpg`
  const subject = 'Your Ovelle download link'
  const heading = 'Get Ovelle on your computer.'
  const instructions = 'Open this email on your Mac or Windows computer, then choose the download for your device.'
  const receipt = 'You requested this link on the Ovelle website. No account or subscription was created.'

  return {
    subject,
    text: `${heading}\n\n${instructions}\n\nDownload Ovelle: ${url}\n\n${receipt}`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#fafaf8;color:#172b3d;font-family:Inter,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Open on your Mac or Windows computer to choose your download.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fafaf8" style="background-color:#fafaf8">
<tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="560" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 12px 16px;color:#172b3d;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.6px">Ovelle</td></tr>
<tr><td bgcolor="#eaf7fd" style="padding:10px;border:1px solid #cbd5de;border-radius:24px;background-color:#eaf7fd;background-image:linear-gradient(150deg,#eaf7fd,#eef2f5)">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td bgcolor="#ffffff" style="padding:26px 22px 24px;border:1px solid #ffffff;border-radius:16px;background-color:#ffffff;background-color:rgba(255,255,255,0.88)">
<h1 style="margin:0 0 12px;color:#172b3d;font-size:32px;line-height:36px;letter-spacing:-0.8px">${heading}</h1>
<p style="margin:0 0 20px;color:#536a7a;font-size:16px;line-height:24px">${instructions}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr><td bgcolor="#00598a" style="border-radius:999px;text-align:center;mso-padding-alt:14px 22px"><a href="${url}" style="display:inline-block;padding:14px 22px;border-radius:999px;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-decoration:none;mso-padding-alt:0">Download Ovelle</a></td></tr>
</table>
</td></tr>
<tr><td style="padding-top:10px"><img src="${image}" width="538" alt="Volunteers picking up litter outdoors" style="display:block;width:100%;max-width:538px;height:auto;border:0;border-radius:16px;color:#172b3d;background-color:#eef2f5;font-size:14px"></td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 12px 0;color:#536a7a;font-size:13px;line-height:20px">${receipt}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  }
}
