/**
 * SmartPRO Hub — Transactional Email Service
 *
 * Uses the Resend API to send branded HTML emails.
 * All email sending must happen server-side to keep the API key private.
 *
 * From address: noreply@thesmartpro.io (requires domain verification in Resend dashboard)
 */
import { Resend } from "resend";
import { ENV } from "./_core/env";

const FROM_ADDRESS = "SmartPRO Hub <noreply@thesmartpro.io>";

function getResend(): Resend {
  if (!ENV.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured. Please add it in the project secrets.");
  }
  return new Resend(ENV.resendApiKey);
}

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  primary:    "#e63946",   // SmartPRO red
  dark:       "#0f0f1a",   // deep navy
  darkCard:   "#1a1a2e",   // card navy
  accent:     "#ff6b6b",   // lighter red for gradients
  white:      "#ffffff",
  bg:         "#f4f6f9",   // page background
  cardBg:     "#fafbfc",   // info card background
  border:     "#e2e8f0",   // subtle border
  text:       "#1e293b",   // primary text
  textMuted:  "#64748b",   // secondary text
  textLight:  "#94a3b8",   // tertiary / footer text
  success:    "#10b981",   // green for trust indicators
};

// ── Shared layout ─────────────────────────────────────────────────────────────
function baseLayout(title: string, preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- ── HEADER ── -->
          <tr>
            <td style="background:${C.dark};border-radius:16px 16px 0 0;padding:0;overflow:hidden;">
              <!-- Gradient accent bar -->
              <div style="height:4px;background:linear-gradient(90deg,${C.primary} 0%,${C.accent} 50%,${C.primary} 100%);"></div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 36px;">
                <tr>
                  <td>
                    <!-- Logo -->
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

          <!-- ── BODY ── -->
          <tr>
            <td style="background:${C.white};padding:40px 36px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
              ${bodyHtml}
            </td>
          </tr>

          <!-- ── FOOTER ── -->
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

// ── Info card row ─────────────────────────────────────────────────────────────
function infoRow(label: string, value: string, highlight = false): string {
  return `
  <tr>
    <td style="color:${C.textMuted};font-size:13px;padding:8px 0;border-bottom:1px solid ${C.border};width:45%;">${label}</td>
    <td style="color:${highlight ? C.primary : C.text};font-size:13px;font-weight:600;text-align:right;padding:8px 0;border-bottom:1px solid ${C.border};">${value}</td>
  </tr>`;
}

// ── CTA button ────────────────────────────────────────────────────────────────
function ctaButton(href: string, label: string, secondary = false): string {
  const bg = secondary ? "transparent" : C.primary;
  const color = secondary ? C.primary : C.white;
  const border = secondary ? `border:2px solid ${C.primary};` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:10px;background:${bg};${border}">
      <a href="${href}" style="display:inline-block;background:${bg};color:${color};font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;${border}">${label} &rarr;</a>
    </td>
  </tr>
</table>`;
}

// ── Role badge ────────────────────────────────────────────────────────────────
function roleBadge(roleLabel: string): string {
  return `<span style="display:inline-block;background:#fff0f1;color:${C.primary};font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #fecdd3;letter-spacing:0.3px;">${roleLabel}</span>`;
}

// ── Trust indicator strip ─────────────────────────────────────────────────────
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

/** Payment reminder for overdue PRO / subscription receivables (collections workflow). */
export async function sendPaymentReminderEmail(params: {
  to: string;
  companyName: string;
  invoiceLabel: string;
  amountOmr: string;
  dueDateStr: string;
  daysPastDue: number;
  portalUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, companyName, invoiceLabel, amountOmr, dueDateStr, daysPastDue, portalUrl } = params;
  const body = `
    <h1 style="color:${C.text};font-size:22px;font-weight:800;margin:0 0 8px;text-align:center;">Payment reminder</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 24px;">Outstanding balance for <strong>${companyName}</strong></p>
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Invoice", invoiceLabel)}
        ${infoRow("Amount (OMR)", amountOmr, true)}
        ${infoRow("Due date", dueDateStr)}
        ${infoRow("Days overdue", String(daysPastDue))}
      </table>
    </div>
    <p style="color:${C.textMuted};font-size:14px;line-height:1.6;margin:0 0 16px;text-align:center;">
      Please arrange payment at your earliest convenience. If you have already paid, disregard this message.
    </p>
    <div style="text-align:center;">
      ${ctaButton(portalUrl, "Open client portal")}
    </div>
    ${trustStrip()}
  `;
  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Payment reminder — ${invoiceLabel} (${amountOmr} OMR)`,
      html: baseLayout(
        `Payment reminder — ${invoiceLabel}`,
        `Balance ${amountOmr} OMR for ${companyName}. Due ${dueDateStr}.`,
        body,
      ),
    });
    if (result.error) {
      console.error("[Email] Payment reminder error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] sendPaymentReminderEmail failed:", err);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 1 — Team Invite
// ─────────────────────────────────────────────────────────────────────────────
export interface InviteEmailParams {
  to: string;
  inviteeName?: string;
  inviterName: string;
  companyName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<{ success: boolean; error?: string }> {
  const { to, inviteeName, inviterName, companyName, role, inviteUrl, expiresAt } = params;
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const expiryStr = expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const greeting = inviteeName ? `Hi <strong>${inviteeName}</strong>,` : "Hello,";

  const body = `
    <!-- Icon banner -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#9993;</div>
    </div>

    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">You've Been Invited!</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">Join <strong>${companyName}</strong> on SmartPRO Business Services Hub</p>

    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 6px;">${greeting}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:${C.text};">${inviterName}</strong> has invited you to collaborate on <strong style="color:${C.text};">${companyName}</strong> as:
    </p>

    <!-- Role highlight -->
    <div style="text-align:center;margin:0 0 28px;">
      ${roleBadge(roleLabel)}
    </div>

    <!-- Info card -->
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Company", companyName)}
        ${infoRow("Your Role", roleLabel, true)}
        ${infoRow("Invite Expires", expiryStr)}
      </table>
    </div>

    <p style="color:${C.textMuted};font-size:14px;line-height:1.6;margin:0 0 4px;text-align:center;">Click below to accept your invitation and create your account:</p>

    <div style="text-align:center;">
      ${ctaButton(inviteUrl, "Accept Invitation")}
    </div>

    <!-- Fallback link -->
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:8px 0 24px;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Or copy this link into your browser:</p>
      <a href="${inviteUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${inviteUrl}</a>
    </div>

    ${trustStrip()}

    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      If you were not expecting this invitation, you can safely ignore this email.<br/>
      This invitation link will expire on <strong>${expiryStr}</strong>.
    </p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `${inviterName} invited you to join ${companyName} on SmartPRO`,
      html: baseLayout(
        `Invitation to join ${companyName}`,
        `${inviterName} has invited you to join ${companyName} as ${roleLabel}. Accept your invitation before ${expiryStr}.`,
        body
      ),
    });
    if (result.error) {
      console.error("[Email] Invite email error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendInviteEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 2 — HR Letter Delivery
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_HR_LETTER_APP_BASE = "https://smartprohub-q4qjnxjv.manus.space";

export interface HRLetterEmailParams {
  to: string;
  /** Optional CC recipients (max 5). */
  cc?: string[];
  employeeName: string;
  letterType: string;
  companyName: string;
  issuedBy: string;
  pdfUrl?: string;
  /** Used for the "Log in to SmartPRO" button when `pdfUrl` is omitted (set from `PUBLIC_APP_URL` or request host). */
  appBaseUrl?: string;
}
export async function sendHRLetterEmail(params: HRLetterEmailParams): Promise<{ success: boolean; error?: string }> {
  const { to, cc, employeeName, letterType, companyName, issuedBy, pdfUrl, appBaseUrl } = params;
  const loginOrigin = (appBaseUrl?.trim().replace(/\/+$/, "") || DEFAULT_HR_LETTER_APP_BASE).replace(/\/+$/, "");
  const loginHref = `${loginOrigin}/`;
  const letterLabel = letterType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const body = `
    <!-- Icon banner -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#128196;</div>
    </div>

    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">Your Official Letter is Ready</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">${letterLabel} &nbsp;·&nbsp; ${companyName}</p>

    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">Dear <strong style="color:${C.text};">${employeeName}</strong>,</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      Your <strong style="color:${C.text};">${letterLabel}</strong> has been officially issued by <strong style="color:${C.text};">${companyName}</strong> and is now available for download.
    </p>

    <!-- Info card -->
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Letter Type", letterLabel, true)}
        ${infoRow("Issued By", companyName)}
        ${infoRow("Prepared By", issuedBy)}
        ${infoRow("Date Issued", dateStr)}
      </table>
    </div>

    ${pdfUrl
      ? `<p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Click below to download your official letter:</p>
         <div style="text-align:center;">${ctaButton(pdfUrl, "Download Letter")}</div>`
      : `<p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Please log in to SmartPRO to view and download your letter:</p>
         <div style="text-align:center;">${ctaButton(loginHref, "Log In to SmartPRO")}</div>`
    }

    <!-- Official stamp note -->
    <div style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;padding:12px 16px;margin:8px 0 24px;">
      <p style="color:#166534;font-size:13px;margin:0;line-height:1.6;">
        &#10003; &nbsp;This is an officially generated document from the SmartPRO HR Management System. It carries the same validity as a printed letter.
      </p>
    </div>

    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      For any queries regarding this letter, please contact your HR department at <strong>${companyName}</strong>.
    </p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      ...(cc && cc.length > 0 ? { cc: cc.slice(0, 5) } : {}),
      subject: `Your ${letterLabel} from ${companyName} — SmartPRO`,
      html: baseLayout(
        `${letterLabel} — ${companyName}`,
        `Your ${letterLabel} has been issued by ${companyName} and is ready to download.`,
        body
      ),
    });
    if (result.error) {
      console.error("[Email] HR letter email error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendHRLetterEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 3 — Contract Signing Notification
// ─────────────────────────────────────────────────────────────────────────────
export interface ContractSigningEmailParams {
  to: string;
  signerName?: string;
  contractTitle: string;
  companyName: string;
  signingUrl: string;
  expiresAt?: Date;
}

export async function sendContractSigningEmail(params: ContractSigningEmailParams): Promise<{ success: boolean; error?: string }> {
  const { to, signerName, contractTitle, companyName, signingUrl, expiresAt } = params;
  const greeting = signerName ? `Dear <strong style="color:${C.text};">${signerName}</strong>,` : "Hello,";
  const expiryStr = expiresAt
    ? expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const body = `
    <!-- Icon banner -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#9997;</div>
    </div>

    <!-- Urgency badge -->
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;background:#fff7ed;color:#c2410c;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;border:1px solid #fed7aa;letter-spacing:0.3px;">&#9888; Action Required</span>
    </div>

    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">Contract Signature Requested</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">${contractTitle}</p>

    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">${greeting}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:${C.text};">${companyName}</strong> has sent you a contract for your digital signature via the SmartPRO Smart Contracts platform.
    </p>

    <!-- Info card -->
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Contract", contractTitle, true)}
        ${infoRow("Issued By", companyName)}
        ${expiryStr ? infoRow("Signing Deadline", expiryStr, true) : ""}
      </table>
    </div>

    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Review the full contract and add your digital signature:</p>
    <div style="text-align:center;">
      ${ctaButton(signingUrl, "Review & Sign Contract")}
    </div>

    <!-- Fallback link -->
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:8px 0 24px;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Or copy this link into your browser:</p>
      <a href="${signingUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${signingUrl}</a>
    </div>

    ${trustStrip()}

    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      If you were not expecting this contract, please contact <strong>${companyName}</strong> directly.<br/>
      Do not sign any document you do not recognise or were not expecting.
    </p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Signature Required: ${contractTitle} — ${companyName}`,
      html: baseLayout(
        `Contract Signature — ${contractTitle}`,
        `${companyName} requires your digital signature on "${contractTitle}". Please review and sign at your earliest convenience.`,
        body
      ),
    });
    if (result.error) {
      console.error("[Email] Contract signing email error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendContractSigningEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Survey Resume Email
// ─────────────────────────────────────────────────────────────────────────────
export interface SurveyResumeEmailParams {
  to: string;
  respondentName?: string;
  surveyTitle: string;
  resumeUrl: string;
  resumeToken: string;
  sectionsCompleted: number;
  totalSections: number;
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Survey completion — thank you + invite / member offer (Resend)
// ─────────────────────────────────────────────────────────────────────────────

export interface SurveyCompletionInviteEmailParams {
  to: string;
  respondentName?: string;
  surveyTitle: string;
  /** True when the response is linked to a logged-in platform user */
  isRegisteredUser: boolean;
  /** Public app origin for CTA buttons, e.g. https://app.example.com */
  appBaseUrl: string;
  /** When set and the respondent is not treated as registered, shown as nurture opt-out link. */
  resumeToken?: string;
}

/**
 * Sent once after a survey is completed when we have an email address.
 * - Registered users: thank you + member-focused offer and dashboard CTA.
 * - Guests: thank you + invite to join SmartPRO Hub with the same offer framing.
 *
 * Optional env (marketing copy):
 * - SURVEY_COMPLETION_OFFER_HEADLINE — short headline for the offer box
 * - SURVEY_COMPLETION_OFFER_BODY — plain text, shown as one paragraph (escaped)
 * - SURVEY_COMPLETION_DEMO_HEADLINE — e.g. "Are you ready to try a demo?"
 * - SURVEY_COMPLETION_DEMO_BODY — plain text for the demo prompt (escaped)
 * - SURVEY_COMPLETION_DEMO_URL — link for the demo CTA (defaults to app home if unset)
 * - SURVEY_COMPLETION_DEMO_CTA_LABEL — button label (default: "Book a free demo")
 */
export async function sendSurveyCompletionInviteEmail(
  params: SurveyCompletionInviteEmailParams,
): Promise<{ success: boolean; error?: string }> {
  if (!ENV.resendApiKey) {
    console.warn("[Email] Survey completion invite skipped: RESEND_API_KEY not set");
    return { success: false, error: "Email not configured" };
  }

  const { to, respondentName, surveyTitle, isRegisteredUser, appBaseUrl, resumeToken } = params;
  const base = appBaseUrl.replace(/\/+$/, "");
  const dashboardUrl = `${base}/`;
  const demoUrl =
    process.env.SURVEY_COMPLETION_DEMO_URL?.trim() || dashboardUrl;
  const demoCtaLabel =
    process.env.SURVEY_COMPLETION_DEMO_CTA_LABEL?.trim() || "Book a free demo";

  const offerHeadline =
    process.env.SURVEY_COMPLETION_OFFER_HEADLINE?.trim() ||
    "Your next step with SmartPRO Hub";
  const offerBody =
    process.env.SURVEY_COMPLETION_OFFER_BODY?.trim() ||
    "Explore HR, payroll, compliance, and PRO services built for businesses in Oman — book a free consultation and see how we can support your operations.";

  const demoHeadline =
    process.env.SURVEY_COMPLETION_DEMO_HEADLINE?.trim() ||
    "Are you ready to try a demo?";
  const demoBody =
    process.env.SURVEY_COMPLETION_DEMO_BODY?.trim() ||
    "See SmartPRO Hub in action with a short walkthrough tailored to your business. No obligation — just tell us what you want to explore and we will set it up.";

  const greeting = respondentName
    ? `Dear <strong>${escapeHtmlText(respondentName)}</strong>,`
    : "Hello,";

  const memberBlock = isRegisteredUser
    ? `<p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 16px;">
        Thank you for completing the survey while signed in to SmartPRO Hub. Your feedback helps us improve solutions for Oman businesses like yours.
      </p>
      <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
        As a member, you have early access to tailored guidance and platform features. Here is a special follow-up for survey participants:
      </p>`
    : `<p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 16px;">
        Thank you for taking the time to complete our survey. Your insights matter to us.
      </p>
      <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
        You can join SmartPRO Hub to manage HR, compliance, and government services in one place — and enjoy this offer for new accounts:
      </p>`;

  const ctaLabel = isRegisteredUser ? "Open SmartPRO Hub" : "Join SmartPRO Hub";

  const nurtureOptOutFooter =
    !isRegisteredUser && resumeToken
      ? `<p style="color:${C.textLight};font-size:11px;text-align:center;margin:16px 0 0;line-height:1.5;">
      <a href="${base}/api/survey/nurture/unsubscribe?token=${encodeURIComponent(resumeToken)}" style="color:${C.textLight};text-decoration:underline;">Opt out of future reminder emails about SmartPRO Hub</a>
    </p>`
      : "";

  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#10003;</div>
    </div>
    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">Thank you!</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">${escapeHtmlText(surveyTitle)}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">${greeting}</p>
    ${memberBlock}
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:20px 20px;margin:0 0 24px;">
      <p style="color:${C.text};font-size:16px;font-weight:700;margin:0 0 10px;">${escapeHtmlText(offerHeadline)}</p>
      <p style="color:${C.textMuted};font-size:14px;line-height:1.65;margin:0;">${escapeHtmlText(offerBody)}</p>
    </div>
    <div style="background:${C.darkCard};border-radius:12px;border:1px solid #2d3748;padding:22px 20px;margin:0 0 8px;">
      <p style="color:${C.white};font-size:17px;font-weight:700;margin:0 0 12px;">${escapeHtmlText(demoHeadline)}</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.65;margin:0 0 8px;">${escapeHtmlText(demoBody)}</p>
    </div>
    <div style="text-align:center;">
      ${ctaButton(demoUrl, demoCtaLabel)}
    </div>
    <p style="color:${C.textLight};font-size:13px;text-align:center;margin:0 0 8px;line-height:1.5;">
      Prefer to browse on your own first? You can always open the platform below.
    </p>
    <div style="text-align:center;">
      ${ctaButton(dashboardUrl, ctaLabel, true)}
    </div>
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:16px 0 0;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">App link:</p>
      <a href="${dashboardUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${dashboardUrl}</a>
    </div>
    ${nurtureOptOutFooter}
    ${trustStrip()}
  `;

  try {
    const resend = getResend();
    const subject = isRegisteredUser
      ? `Thank you — ${surveyTitle} · Ready for a demo?`
      : `Thank you — ${surveyTitle} · Try a free demo`;

    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html: baseLayout(
        `Survey complete — ${surveyTitle}`,
        `${isRegisteredUser ? "Book a demo or explore SmartPRO Hub." : "Your invitation — see a live demo or join SmartPRO Hub."}`,
        body,
      ),
    });
    if (result.error) {
      console.error("[Email] Survey completion invite error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendSurveyCompletionInviteEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export interface SanadOfficeSurveyBridgeEmailParams {
  to: string;
  officeName: string;
  officeNameAr?: string;
  surveyUrl: string;
  contactPerson?: string;
}

/**
 * Invite a Sanad service office to take / share the business survey — positioned as gov ↔ business bridge.
 */
export async function sendSanadOfficeSurveyBridgeEmail(
  params: SanadOfficeSurveyBridgeEmailParams,
): Promise<{ success: boolean; error?: string }> {
  if (!ENV.resendApiKey) {
    console.warn("[Email] Sanad office survey invite skipped: RESEND_API_KEY not set");
    return { success: false, error: "Email not configured" };
  }

  const { to, officeName, officeNameAr, surveyUrl, contactPerson } = params;
  const greet = contactPerson ? `Dear ${escapeHtmlText(contactPerson)},` : `Hello from <strong>${escapeHtmlText(officeName)}</strong>,`;

  const body = `
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 16px;">${greet}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">
      SmartPRO Hub is running a short <strong>Business Sector Intelligence</strong> survey to understand how companies interact with government services and where PRO offices like yours fit as the bridge between regulators and businesses.
    </p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      Please <strong>sign in with your existing SmartPRO account</strong> (the same login you use for your Sanad office) and open the link below. Your responses will be attributed to your office so we can see patterns across Oman’s service bureau network.
    </p>
    ${officeNameAr ? `<p style="color:${C.textMuted};font-size:14px;line-height:1.65;margin:0 0 20px;" dir="rtl">${escapeHtmlText(officeNameAr)} — نفس الرابط أدناه بعد تسجيل الدخول.</p>` : ""}
    <div style="text-align:center;">
      ${ctaButton(surveyUrl, "Open survey (sign in required for office link)")}
    </div>
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:16px 0 0;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Direct link:</p>
      <a href="${surveyUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${surveyUrl}</a>
    </div>
    ${trustStrip()}
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `SmartPRO — Business sector survey (Sanad office: ${officeName})`,
      html: baseLayout(
        "Survey invitation — Sanad office partner",
        "Sign in and complete the sector survey attributed to your office.",
        body,
      ),
    });
    if (result.error) {
      console.error("[Email] Sanad office survey bridge error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendSanadOfficeSurveyBridgeEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export interface SurveyNurtureFollowupEmailParams {
  to: string;
  respondentName?: string;
  surveyTitle: string;
  /** 1-based follow-up sequence (after the initial completion email). */
  followUpIndex: number;
  resumeToken: string;
  appBaseUrl: string;
}

/**
 * Follow-up nurture email for anonymous respondents who have not yet registered.
 * Includes unsubscribe link using resume token.
 */
export async function sendSurveyNurtureFollowupEmail(
  params: SurveyNurtureFollowupEmailParams,
): Promise<{ success: boolean; error?: string }> {
  if (!ENV.resendApiKey) {
    console.warn("[Email] Survey nurture follow-up skipped: RESEND_API_KEY not set");
    return { success: false, error: "Email not configured" };
  }

  const { to, respondentName, surveyTitle, followUpIndex, resumeToken, appBaseUrl } = params;
  const base = appBaseUrl.replace(/\/+$/, "");
  const dashboardUrl = `${base}/`;
  const demoUrl = process.env.SURVEY_COMPLETION_DEMO_URL?.trim() || dashboardUrl;
  const demoCta =
    process.env.SURVEY_COMPLETION_DEMO_CTA_LABEL?.trim() || "Book a free demo";
  const unsubscribeUrl = `${base}/api/survey/nurture/unsubscribe?token=${encodeURIComponent(resumeToken)}`;

  const headline =
    process.env.SURVEY_NURTURE_FOLLOWUP_HEADLINE?.trim() ||
    "Still thinking about SmartPRO Hub?";
  const bodyText =
    process.env.SURVEY_NURTURE_FOLLOWUP_BODY?.trim() ||
    "You shared valuable feedback in our survey. When you are ready, create your free account to explore HR, payroll, compliance, and PRO tools built for Oman — or book a short demo with our team.";

  const greeting = respondentName
    ? `Dear <strong>${escapeHtmlText(respondentName)}</strong>,`
    : "Hello,";

  const body = `
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 16px;">${greeting}</p>
    <p style="color:${C.text};font-size:18px;font-weight:700;margin:0 0 12px;">${escapeHtmlText(headline)}</p>
    <p style="color:${C.textMuted};font-size:14px;line-height:1.65;margin:0 0 20px;">${escapeHtmlText(bodyText)}</p>
    <p style="color:${C.textMuted};font-size:13px;margin:0 0 20px;">Reference: <strong>${escapeHtmlText(surveyTitle)}</strong> · Follow-up #${followUpIndex}</p>
    <div style="text-align:center;">
      ${ctaButton(demoUrl, demoCta)}
    </div>
    <div style="text-align:center;">
      ${ctaButton(dashboardUrl, "Create your account", true)}
    </div>
    <p style="color:${C.textLight};font-size:11px;text-align:center;margin:24px 0 8px;line-height:1.5;">
      <a href="${unsubscribeUrl}" style="color:${C.textLight};text-decoration:underline;">Unsubscribe from these reminders</a>
    </p>
    ${trustStrip()}
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `SmartPRO Hub — ${headline} (${followUpIndex})`,
      html: baseLayout(
        `Reminder — ${surveyTitle}`,
        "Join SmartPRO Hub or book a demo when you are ready.",
        body,
      ),
    });
    if (result.error) {
      console.error("[Email] Survey nurture follow-up error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendSurveyNurtureFollowupEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function sendSurveyResumeEmail(
  params: SurveyResumeEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { to, respondentName, surveyTitle, resumeUrl, resumeToken, sectionsCompleted, totalSections } = params;
  const greeting = respondentName ? `Dear <strong>${respondentName}</strong>,` : "Hello,";
  const progress = totalSections > 0 ? Math.round((sectionsCompleted / totalSections) * 100) : 0;

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#128203;</div>
    </div>
    <h1 style="color:${C.text};font-size:24px;font-weight:800;margin:0 0 6px;text-align:center;letter-spacing:-0.5px;">Resume Your Survey</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 28px;">${surveyTitle}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 20px;">${greeting}</p>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.7;margin:0 0 24px;">
      You requested a link to resume your survey response. Your progress has been saved and is ready for you to continue.
    </p>
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Survey", surveyTitle, true)}
        ${infoRow("Progress", `${sectionsCompleted} of ${totalSections} sections completed (${progress}%)`)}
        ${infoRow("Your Resume Token", resumeToken)}
      </table>
    </div>
    <div style="background:#e5e7eb;border-radius:99px;height:8px;margin:0 0 24px;overflow:hidden;">
      <div style="background:${C.primary};height:8px;width:${progress}%;border-radius:99px;"></div>
    </div>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Click the button below to continue where you left off:</p>
    <div style="text-align:center;">
      ${ctaButton(resumeUrl, "Continue Survey")}
    </div>
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:8px 0 24px;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Or copy this link into your browser:</p>
      <a href="${resumeUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${resumeUrl}</a>
    </div>
    ${trustStrip()}
    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      This link is unique to your response. Do not share it with others.<br/>
      You can also use your resume token directly on the survey page: <strong>${resumeToken}</strong>
    </p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Resume Your Survey: ${surveyTitle}`,
      html: baseLayout(
        `Resume Survey — ${surveyTitle}`,
        `Your survey progress has been saved. Click to continue where you left off.`,
        body,
      ),
    });
    if (result.error) {
      console.error("[Email] Survey resume email error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendSurveyResumeEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

/**
 * Notify a client contact that an attendance approval batch has been submitted
 * and is awaiting their review.
 *
 * UX-5A: Email adapter exists; client contact routing (clientCompanyId → email)
 * is the remaining gap. This function accepts a pre-resolved `to` address.
 * Call site is responsible for finding the contact email from clientCompanyId.
 */
export async function sendClientApprovalBatchEmail(params: {
  to: string;
  batchId: number;
  periodStart: string;
  periodEnd: string;
  siteName: string | null;
  approvalUrl: string;
  expiresInDays: number;
}): Promise<{ success: boolean; error?: string }> {
  const { to, batchId, periodStart, periodEnd, siteName, approvalUrl, expiresInDays } = params;

  const siteRow = siteName ? infoRow("Site", siteName) : "";
  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,${C.primary},${C.accent});border-radius:50%;width:64px;height:64px;line-height:64px;font-size:28px;color:${C.white};text-align:center;">&#10003;</div>
    </div>
    <h1 style="color:${C.text};font-size:22px;font-weight:800;margin:0 0 8px;text-align:center;">Attendance Approval Required</h1>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 24px;">Please review the attendance records for the period below and approve or reject.</p>
    <div style="background:${C.cardBg};border-radius:12px;border:1px solid ${C.border};padding:4px 20px;margin:0 0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Batch Reference", `#${batchId}`, true)}
        ${infoRow("Period", `${periodStart} – ${periodEnd}`)}
        ${siteRow}
        ${infoRow("Link expires in", `${expiresInDays} days`)}
      </table>
    </div>
    <p style="color:${C.textMuted};font-size:14px;text-align:center;margin:0 0 4px;">Click the button below to review and respond:</p>
    <div style="text-align:center;">
      ${ctaButton(approvalUrl, "Review Attendance")}
    </div>
    <div style="background:${C.cardBg};border-radius:8px;border:1px solid ${C.border};padding:12px 16px;margin:8px 0 24px;word-break:break-all;">
      <p style="color:${C.textMuted};font-size:12px;margin:0 0 4px;">Or copy this link into your browser:</p>
      <a href="${approvalUrl}" style="color:${C.primary};font-size:12px;word-break:break-all;">${approvalUrl}</a>
    </div>
    ${trustStrip()}
    <hr style="border:none;border-top:1px solid ${C.border};margin:28px 0 20px;" />
    <p style="color:${C.textLight};font-size:12px;margin:0;text-align:center;line-height:1.6;">
      This link is unique to this approval batch. Do not share it with unauthorized parties.<br/>
      The link will expire in ${expiresInDays} days.
    </p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Attendance Approval Required — Batch #${batchId} (${periodStart} – ${periodEnd})`,
      html: baseLayout(
        `Attendance Approval — Batch #${batchId}`,
        `Attendance records for ${periodStart} – ${periodEnd} require your approval.`,
        body,
      ),
    });
    if (result.error) {
      console.error("[Email] sendClientApprovalBatchEmail error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Email] sendClientApprovalBatchEmail failed:", err);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}
