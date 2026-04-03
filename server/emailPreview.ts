/**
 * SmartPRO Hub — Email Preview Helpers
 *
 * Exports pure HTML builder functions used by the admin email preview page.
 * These functions are extracted from email.ts so they can be called without
 * actually sending an email (preview mode).
 */

// ── Brand tokens (must stay in sync with email.ts) ────────────────────────────
const C = {
  primary:   "#e63946",
  dark:      "#0f0f1a",
  accent:    "#ff6b6b",
  white:     "#ffffff",
  bg:        "#f4f6f9",
  cardBg:    "#fafbfc",
  border:    "#e2e8f0",
  text:      "#1e293b",
  textMuted: "#64748b",
  textLight: "#94a3b8",
  success:   "#10b981",
};

function baseLayout(title: string, preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- HEADER -->
          <tr>
            <td style="background:${C.dark};border-radius:16px 16px 0 0;padding:0;overflow:hidden;">
              <div style="height:4px;background:linear-gradient(90deg,${C.primary} 0%,${C.accent} 50%,${C.primary} 100%);"></div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 36px;">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          <span style="display:inline-block;background:${C.primary};color:${C.white};font-size:11px;font-weight:800;letter-spacing:1.5px;padding:4px 8px;border-radius:4px;text-transform:uppercase;">SP</span>
                        </td>
                        <td style="vertical-align:middle;padding-left:10px;">
                          <span style="color:${C.primary};font-size:20px;font-weight:800;letter-spacing:-0.5px;">Smart</span><span style="color:${C.white};font-size:20px;font-weight:800;letter-spacing:-0.5px;">PRO</span>
                        </td>
                        <td style="vertical-align:middle;padding-left:10px;">
                          <span style="color:#4a5568;font-size:12px;font-weight:400;border-left:1px solid #2d3748;padding-left:10px;">Business Services Hub</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="color:#4a5568;font-size:11px;">Sultanate of Oman</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background:${C.white};padding:40px 36px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
              ${bodyHtml}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background:${C.dark};border-radius:0 0 16px 16px;padding:24px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <p style="color:#4a5568;font-size:12px;margin:0 0 6px;">
                      <span style="color:${C.primary};font-weight:700;">Smart</span><span style="color:${C.white};font-weight:700;">PRO</span>
                      <span style="color:#4a5568;"> &nbsp;·&nbsp; Business Services Hub &nbsp;·&nbsp; Sultanate of Oman</span>
                    </p>
                    <p style="color:#2d3748;font-size:11px;margin:0;">
                      © ${new Date().getFullYear()} SmartPRO. All rights reserved. &nbsp;·&nbsp; This email was sent automatically — please do not reply.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function infoRow(label: string, value: string, highlight = false): string {
  return `
  <tr>
    <td style="color:${C.textMuted};font-size:13px;padding:8px 0;border-bottom:1px solid ${C.border};width:45%;">${label}</td>
    <td style="color:${highlight ? C.primary : C.text};font-size:13px;font-weight:600;text-align:right;padding:8px 0;border-bottom:1px solid ${C.border};">${value}</td>
  </tr>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:10px;background:${C.primary};">
      <a href="${href}" style="display:inline-block;background:${C.primary};color:${C.white};font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">${label} &rarr;</a>
    </td>
  </tr>
</table>`;
}

function roleBadge(roleLabel: string): string {
  return `<span style="display:inline-block;background:#fff0f1;color:${C.primary};font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #fecdd3;letter-spacing:0.3px;">${roleLabel}</span>`;
}

function trustStrip(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;background:${C.cardBg};border-radius:10px;border:1px solid ${C.border};padding:14px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:0 16px;text-align:center;border-right:1px solid ${C.border};">
              <div style="color:${C.success};font-size:18px;margin-bottom:2px;">&#10003;</div>
              <div style="color:${C.textMuted};font-size:11px;">Secure Link</div>
            </td>
            <td style="padding:0 16px;text-align:center;border-right:1px solid ${C.border};">
              <div style="color:${C.success};font-size:18px;margin-bottom:2px;">&#128274;</div>
              <div style="color:${C.textMuted};font-size:11px;">Encrypted</div>
            </td>
            <td style="padding:0 16px;text-align:center;">
              <div style="color:${C.success};font-size:18px;margin-bottom:2px;">&#9733;</div>
              <div style="color:${C.textMuted};font-size:11px;">Verified Platform</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// ── Public builders ───────────────────────────────────────────────────────────

export interface InvitePreviewParams {
  inviteeName: string;
  inviterName: string;
  companyName: string;
  roleLabel: string;
  expiryStr: string;
  inviteUrl: string;
}

export function buildInviteEmailHtml(p: InvitePreviewParams): string {
  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#9993;</div>
    </div>
    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">You've Been Invited!</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">Join <strong>${p.companyName}</strong> on SmartPRO Business Services Hub</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 6px;">Hi <strong style="color:${C.text};">${p.inviteeName}</strong>,</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:${C.text};">${p.inviterName}</strong> has invited you to collaborate on <strong style="color:${C.text};">${p.companyName}</strong> as:
    </p>
    <div style="text-align:center;margin:0 0 28px;">${roleBadge(p.roleLabel)}</div>
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Company", p.companyName)}
        ${infoRow("Your Role", p.roleLabel, true)}
        ${infoRow("Invite Expires", p.expiryStr)}
      </table>
    </div>
    <p style="color:${C.textMuted};font-size:14px;line-height:1.6;margin:0 0 4px;text-align:center;">Click below to accept your invitation and create your account:</p>
    <div style="text-align:center;">${ctaButton(p.inviteUrl, "Accept Invitation")}</div>
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:8px 0 24px;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Or copy this link into your browser:</p>
      <a href="${p.inviteUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${p.inviteUrl}</a>
    </div>
    ${trustStrip()}
    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      If you were not expecting this invitation, you can safely ignore this email.<br/>
      This invitation link will expire on <strong>${p.expiryStr}</strong>.
    </p>`;
  return baseLayout(
    `Invitation to join ${p.companyName}`,
    `${p.inviterName} has invited you to join ${p.companyName} as ${p.roleLabel}. Accept before ${p.expiryStr}.`,
    body
  );
}

export interface HRLetterPreviewParams {
  employeeName: string;
  letterLabel: string;
  companyName: string;
  issuedBy: string;
  dateStr: string;
  pdfUrl?: string;
}

export function buildHRLetterEmailHtml(p: HRLetterPreviewParams): string {
  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#128196;</div>
    </div>
    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">Your Official Letter is Ready</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">${p.letterLabel} &nbsp;·&nbsp; ${p.companyName}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">Dear <strong style="color:${C.text};">${p.employeeName}</strong>,</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      Your <strong style="color:${C.text};">${p.letterLabel}</strong> has been officially issued by <strong style="color:${C.text};">${p.companyName}</strong> and is now available for download.
    </p>
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Letter Type", p.letterLabel, true)}
        ${infoRow("Issued By", p.companyName)}
        ${infoRow("Prepared By", p.issuedBy)}
        ${infoRow("Date Issued", p.dateStr)}
      </table>
    </div>
    ${p.pdfUrl
      ? `<p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Click below to download your official letter:</p>
         <div style="text-align:center;">${ctaButton(p.pdfUrl, "Download Letter")}</div>`
      : `<p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Please log in to SmartPRO to view and download your letter:</p>
         <div style="text-align:center;">${ctaButton("https://smartprohub-q4qjnxjv.manus.space", "Log In to SmartPRO")}</div>`
    }
    <div style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;padding:12px 16px;margin:8px 0 24px;">
      <p style="color:#166534;font-size:13px;margin:0;line-height:1.6;">
        &#10003; &nbsp;This is an officially generated document from the SmartPRO HR Management System.
      </p>
    </div>
    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      For any queries, please contact your HR department at <strong>${p.companyName}</strong>.
    </p>`;
  return baseLayout(
    `${p.letterLabel} — ${p.companyName}`,
    `Your ${p.letterLabel} has been issued by ${p.companyName} and is ready to download.`,
    body
  );
}

export interface ContractSigningPreviewParams {
  signerName: string;
  contractTitle: string;
  companyName: string;
  signingUrl: string;
  expiryStr?: string;
}

export function buildContractSigningEmailHtml(p: ContractSigningPreviewParams): string {
  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#9997;</div>
    </div>
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;background:#fff7ed;color:#c2410c;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;border:1px solid #fed7aa;letter-spacing:0.3px;">&#9888; Action Required</span>
    </div>
    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">Contract Signature Requested</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">${p.contractTitle}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">Dear <strong style="color:${C.text};">${p.signerName}</strong>,</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:${C.text};">${p.companyName}</strong> has sent you a contract for your digital signature via the SmartPRO Smart Contracts platform.
    </p>
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Contract", p.contractTitle, true)}
        ${infoRow("Issued By", p.companyName)}
        ${p.expiryStr ? infoRow("Signing Deadline", p.expiryStr, true) : ""}
      </table>
    </div>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Review the full contract and add your digital signature:</p>
    <div style="text-align:center;">${ctaButton(p.signingUrl, "Review & Sign Contract")}</div>
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:8px 0 24px;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Or copy this link into your browser:</p>
      <a href="${p.signingUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${p.signingUrl}</a>
    </div>
    ${trustStrip()}
    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      If you were not expecting this contract, please contact <strong>${p.companyName}</strong> directly.<br/>
      Do not sign any document you do not recognise or were not expecting.
    </p>`;
  return baseLayout(
    `Contract Signature — ${p.contractTitle}`,
    `${p.companyName} requires your digital signature on "${p.contractTitle}". Please review and sign.`,
    body
  );
}
