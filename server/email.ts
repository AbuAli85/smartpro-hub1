/**
 * SmartPRO Hub — Transactional Email Service
 *
 * Uses the Resend API to send branded HTML emails.
 * All email sending must happen server-side to keep the API key private.
 *
 * From address: onboarding@resend.dev (Resend shared domain, works without custom domain)
 * To use a custom domain: verify it in Resend dashboard and update FROM_ADDRESS.
 */
import { Resend } from "resend";
import { ENV } from "./_core/env";

const FROM_ADDRESS = "SmartPRO Hub <onboarding@resend.dev>";

function getResend(): Resend {
  if (!ENV.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured. Please add it in the project secrets.");
  }
  return new Resend(ENV.resendApiKey);
}

// ── Brand colours ─────────────────────────────────────────────────────────────
const BRAND_PRIMARY = "#e63946";   // SmartPRO red
const BRAND_DARK    = "#1a1a2e";   // dark navy/black
const BRAND_LIGHT   = "#f8f9fa";   // off-white background

// ── Base HTML layout ──────────────────────────────────────────────────────────
function baseLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_LIGHT};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_LIGHT};padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_DARK};border-radius:12px 12px 0 0;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:${BRAND_PRIMARY};font-size:22px;font-weight:800;letter-spacing:-0.5px;">Smart</span><span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">PRO</span>
                    <span style="color:#aaaaaa;font-size:13px;margin-left:8px;">Business Services Hub</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border-left:1px solid #e8e8e8;border-right:1px solid #e8e8e8;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:${BRAND_DARK};border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
              <p style="color:#888888;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} SmartPRO Business Services Hub &nbsp;·&nbsp; Sultanate of Oman<br/>
                <span style="color:#666666;">This email was sent automatically. Please do not reply to this message.</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Button helper ─────────────────────────────────────────────────────────────
function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:8px;text-decoration:none;margin:20px 0;">${label}</a>`;
}

// ── Email: Team Invite ────────────────────────────────────────────────────────
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
  const greeting = inviteeName ? `Hi ${inviteeName},` : "Hello,";

  const body = `
    <h2 style="color:${BRAND_DARK};font-size:22px;margin:0 0 8px;">You've been invited to join ${companyName}</h2>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 20px;">${greeting}</p>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on SmartPRO Business Services Hub as a <strong>${roleLabel}</strong>.
    </p>
    <div style="background:${BRAND_LIGHT};border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Company</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${companyName}</td>
        </tr>
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Your Role</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${roleLabel}</td>
        </tr>
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Invite Expires</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${expiryStr}</td>
        </tr>
      </table>
    </div>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 8px;">Click the button below to accept your invitation and set up your account:</p>
    ${ctaButton(inviteUrl, "Accept Invitation")}
    <p style="color:#999999;font-size:13px;margin:16px 0 0;">Or copy this link: <a href="${inviteUrl}" style="color:${BRAND_PRIMARY};">${inviteUrl}</a></p>
    <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;" />
    <p style="color:#aaaaaa;font-size:12px;margin:0;">If you did not expect this invitation, you can safely ignore this email.</p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `You've been invited to join ${companyName} on SmartPRO`,
      html: baseLayout(`Invitation to join ${companyName}`, body),
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

// ── Email: HR Letter Delivery ─────────────────────────────────────────────────
export interface HRLetterEmailParams {
  to: string;
  employeeName: string;
  letterType: string;
  companyName: string;
  issuedBy: string;
  pdfUrl?: string;
}

export async function sendHRLetterEmail(params: HRLetterEmailParams): Promise<{ success: boolean; error?: string }> {
  const { to, employeeName, letterType, companyName, issuedBy, pdfUrl } = params;
  const letterLabel = letterType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const body = `
    <h2 style="color:${BRAND_DARK};font-size:22px;margin:0 0 16px;">Your ${letterLabel} is Ready</h2>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Your <strong>${letterLabel}</strong> has been issued by <strong>${companyName}</strong> and is now available.
    </p>
    <div style="background:${BRAND_LIGHT};border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Letter Type</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${letterLabel}</td>
        </tr>
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Issued By</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${companyName}</td>
        </tr>
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Prepared By</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${issuedBy}</td>
        </tr>
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Date Issued</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</td>
        </tr>
      </table>
    </div>
    ${pdfUrl ? `
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 8px;">You can download your letter using the link below:</p>
    ${ctaButton(pdfUrl, "Download Letter")}
    ` : `<p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 8px;">Please log in to SmartPRO to view and download your letter.</p>`}
    <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;" />
    <p style="color:#aaaaaa;font-size:12px;margin:0;">This letter was generated by the SmartPRO HR Management System. For any queries, please contact your HR department.</p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Your ${letterLabel} from ${companyName}`,
      html: baseLayout(`${letterLabel} — ${companyName}`, body),
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

// ── Email: Contract Signing Notification ──────────────────────────────────────
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
  const greeting = signerName ? `Dear ${signerName},` : "Hello,";
  const expiryNote = expiresAt
    ? `<tr><td style="color:#888888;font-size:13px;padding:4px 0;">Signing Deadline</td><td style="color:#e63946;font-size:13px;font-weight:600;text-align:right;">${expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</td></tr>`
    : "";

  const body = `
    <h2 style="color:${BRAND_DARK};font-size:22px;margin:0 0 16px;">Action Required: Contract Signature</h2>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 20px;">${greeting}</p>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 20px;">
      <strong>${companyName}</strong> has sent you a contract for your digital signature via SmartPRO.
    </p>
    <div style="background:${BRAND_LIGHT};border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Contract</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${contractTitle}</td>
        </tr>
        <tr>
          <td style="color:#888888;font-size:13px;padding:4px 0;">Issued By</td>
          <td style="color:${BRAND_DARK};font-size:13px;font-weight:600;text-align:right;">${companyName}</td>
        </tr>
        ${expiryNote}
      </table>
    </div>
    <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 8px;">Please review and sign the contract by clicking the button below:</p>
    ${ctaButton(signingUrl, "Review & Sign Contract")}
    <p style="color:#999999;font-size:13px;margin:16px 0 0;">Or copy this link: <a href="${signingUrl}" style="color:${BRAND_PRIMARY};">${signingUrl}</a></p>
    <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;" />
    <p style="color:#aaaaaa;font-size:12px;margin:0;">If you were not expecting this contract, please contact ${companyName} directly. Do not sign documents you do not recognise.</p>
  `;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Signature Required: ${contractTitle}`,
      html: baseLayout(`Contract Signature — ${contractTitle}`, body),
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
