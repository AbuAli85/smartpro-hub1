import { LETTER_TEMPLATE_META } from "./meta";
import type { LetterRenderContext } from "./buildContext";
import { formatEnglishTitleLine } from "./displayFormat";
import type { LetterLanguageMode } from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addresseeEn(ctx: LetterRenderContext): string {
  const t = ctx.issuedTo.trim();
  if (!t || /^to whom it may concern$/i.test(t)) return "To Whom It May Concern";
  return t;
}

/** Arabic block: never show English “To Whom It May Concern”. */
function addresseeAr(ctx: LetterRenderContext): string {
  const t = ctx.issuedTo.trim();
  if (!t || /^to whom it may concern$/i.test(t)) return "إلى من يهمه الأمر";
  if (/[\u0600-\u06FF]/.test(t)) return t;
  return t;
}

function metaBlockEn(ctx: LetterRenderContext, subject: string): string {
  const addressee = addresseeEn(ctx);
  return `
<p style="text-align:right"><strong>${esc(ctx.referenceLabelEn)}</strong></p>
<p style="text-align:right">${esc(ctx.dateLineEn)}</p>
<p>${esc(addressee)}</p>
<p><strong>Subject: ${esc(subject)}</strong></p>
`.trim();
}

function metaBlockAr(ctx: LetterRenderContext, subjectAr: string): string {
  const addressee = addresseeAr(ctx);
  return `
<p dir="rtl" style="text-align:right"><strong>${esc(ctx.referenceLabelAr)}</strong></p>
<p dir="rtl" style="text-align:right">${esc(ctx.dateLineAr)}</p>
<p dir="rtl" style="text-align:right">${esc(addressee)}</p>
<p dir="rtl" style="text-align:right"><strong>الموضوع: ${esc(subjectAr)}</strong></p>
`.trim();
}

function signatoryEn(ctx: LetterRenderContext): string {
  return `
<p>Yours faithfully,</p>
<p><strong>${esc(ctx.signatoryNameEn)}</strong><br/>${esc(ctx.signatoryTitleEn)}<br/>For and on behalf of ${esc(ctx.companyNameEn)}</p>
`.trim();
}

function signatoryAr(ctx: LetterRenderContext): string {
  return `
<p dir="rtl" style="text-align:right">وتفضلوا بقبول فائق الاحترام،</p>
<p dir="rtl" style="text-align:right"><strong>${esc(ctx.signatoryNameAr)}</strong><br/>${esc(ctx.signatoryTitleAr)}<br/>نيابةً عن ${esc(ctx.companyNameAr)}</p>
`.trim();
}

function f(d?: string): string {
  return d?.trim() ? esc(d.trim()) : "—";
}

function ft(d?: string): string {
  return d?.trim() ? esc(formatEnglishTitleLine(d.trim())) : "—";
}

function employeeHonorificEn(displayName: string): string {
  const n = displayName.trim();
  if (/^(mr|mrs|ms|miss|dr|prof)\b/i.test(n)) return "";
  return "Mr./Ms. ";
}

export function renderOfficialLetter(ctx: LetterRenderContext): {
  subject: string;
  bodyEn: string | null;
  bodyAr: string | null;
} {
  const meta = LETTER_TEMPLATE_META[ctx.letterType];
  const subjectEn = meta.nameEn;
  const subjectAr = meta.nameAr;

  switch (ctx.letterType) {
    case "salary_certificate":
      return renderSalary(ctx, subjectEn, subjectAr);
    case "employment_verification":
      return renderEmployment(ctx, subjectEn, subjectAr);
    case "noc":
      return renderNoc(ctx, subjectEn, subjectAr);
    case "experience_letter":
      return renderExperience(ctx, subjectEn, subjectAr);
    case "promotion_letter":
      return renderPromotion(ctx, subjectEn, subjectAr);
    case "salary_transfer_letter":
      return renderSalaryTransfer(ctx, subjectEn, subjectAr);
    case "leave_approval_letter":
      return renderLeave(ctx, subjectEn, subjectAr);
    case "warning_letter":
      return renderWarning(ctx, subjectEn, subjectAr);
    default:
      return { subject: subjectEn, bodyEn: "<p></p>", bodyAr: null };
  }
}

function pickSubject(language: LetterLanguageMode, en: string, ar: string): string {
  if (language === "ar") return ar;
  return en;
}

function renderSalary(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear Sir/Madam,</p>
<p>This is to certify that <strong>${esc(ctx.employeeNameEn)}</strong>, holding Civil ID / passport details on record as applicable, is employed with <strong>${esc(ctx.companyNameEn)}</strong> as <strong>${esc(ctx.position)}</strong> in <strong>${esc(ctx.department)}</strong>.</p>
<p>The employee’s current gross monthly salary is <strong>${esc(ctx.salaryFormatted)}</strong>, as per company records.</p>
<p>This certificate is issued upon the employee’s request, without further liability on the part of the company.</p>
${ctx.additionalNotes ? `<p><em>${esc(ctx.additionalNotes)}</em></p>` : ""}
${signatoryEn(ctx)}
`.trim();
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">السلام عليكم،</p>
<p dir="rtl">نشهد بموجب هذا أن السيد/السيدة <strong>${esc(ctx.employeeNameAr)}</strong> يعمل/تعمل لدى <strong>${esc(ctx.companyNameAr)}</strong> بصفة <strong>${esc(ctx.position)}</strong> ضمن <strong>${esc(ctx.department)}</strong>.</p>
<p dir="rtl">ويُستحق الموظف راتباً شهرياً إجمالياً قدره <strong>${esc(ctx.salaryFormatted)}</strong> وفق سجلات الشركة.</p>
<p dir="rtl">أُصدرت هذه الشهادة بناءً على طلب الموظف دون تحمّل الشركة أي التزامات إضافية.</p>
${ctx.additionalNotes ? `<p dir="rtl"><em>${esc(ctx.additionalNotes)}</em></p>` : ""}
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderEmployment(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const incSal =
    ctx.fields.includeSalary === true ||
    (typeof ctx.fields.includeSalary === "string" && ctx.fields.includeSalary === "true");
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear Sir/Madam,</p>
<p>This letter confirms that <strong>${esc(ctx.employeeNameEn)}</strong> is employed with <strong>${esc(ctx.companyNameEn)}</strong> as <strong>${esc(ctx.position)}</strong> (${esc(ctx.department)}), with effect from <strong>${esc(ctx.hireDateEn)}</strong>. The employment status is <strong>${esc(ctx.employmentStatus)}</strong>.</p>
${incSal && ctx.salaryFormatted !== "—" ? `<p>Remuneration (for reference): <strong>${esc(ctx.salaryFormatted)}</strong>.</p>` : ""}
${ctx.purpose ? `<p>Purpose stated: ${esc(ctx.purpose)}.</p>` : ""}
${signatoryEn(ctx)}
`.trim();
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">نشهد بموجب هذا أن <strong>${esc(ctx.employeeNameAr)}</strong> يعمل/تعمل لدى <strong>${esc(ctx.companyNameAr)}</strong> بصفة <strong>${esc(ctx.position)}</strong> (${esc(ctx.department)})، اعتباراً من <strong>${esc(ctx.hireDateAr)}</strong>. حالة التوظيف: <strong>${esc(ctx.employmentStatus)}</strong>.</p>
${incSal && ctx.salaryFormatted !== "—" ? `<p dir="rtl">الأجر (للعلم): <strong>${esc(ctx.salaryFormatted)}</strong>.</p>` : ""}
${ctx.purpose ? `<p dir="rtl">الغرض: ${esc(ctx.purpose)}.</p>` : ""}
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderNoc(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const destRaw =
    ctx.fields.destination?.trim() ||
    ctx.fields.destinationInstitution?.trim() ||
    "";
  const dest = destRaw ? esc(destRaw) : "—";
  const until = f(ctx.fields.validityUntil);
  const purposeLine = esc(ctx.purpose.trim() || "—");
  const hon = employeeHonorificEn(ctx.employeeNameEn);
  const destClause =
    destRaw.trim().length > 0 ? ` in connection with <strong>${dest}</strong>` : "";
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear Sir/Madam,</p>
<p>This is to certify that <strong>${esc(ctx.companyNameEn)}</strong> has no objection to <strong>${esc(hon + ctx.employeeNameEn)}</strong> for the purpose of <strong>${purposeLine}</strong>${destClause}.</p>
<p>This certificate is issued at the employee’s request. It remains valid until <strong>${until}</strong>, unless revoked in writing earlier. The employee is expected to comply with all applicable laws and company policies.</p>
${signatoryEn(ctx)}
`.trim();
  const destAr = destRaw ? esc(destRaw) : "—";
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">السلام عليكم ورحمة الله وبركاته،</p>
<p dir="rtl">نشهد بموجب هذا أن <strong>${esc(ctx.companyNameAr)}</strong> لا تمانع لموظفها <strong>${esc(ctx.employeeNameAr)}</strong> لغرض <strong>${purposeLine}</strong>، وذلك فيما يتعلق بـ <strong>${destAr}</strong>.</p>
<p dir="rtl">وقد أُصدرت هذه الشهادة بناءً على طلب الموظف لتقديمها إلى الجهة المعنية، وتظل سارية حتى تاريخ <strong>${until}</strong> ما لم يُلغَ خطياً. ويُتوقع من الموظف الالتزام بالأنظمة واللوائح المعمول بها.</p>
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderExperience(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const employed =
    ctx.fields.currentlyEmployed === true ||
    (typeof ctx.fields.currentlyEmployed === "string" && ctx.fields.currentlyEmployed === "true");
  const end = employed ? "Present" : f(ctx.fields.employmentEndDate);
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>To Whom It May Concern,</p>
<p>This is to certify that <strong>${esc(ctx.employeeNameEn)}</strong> was / has been employed with <strong>${esc(ctx.companyNameEn)}</strong> as <strong>${esc(ctx.position)}</strong> from <strong>${esc(ctx.hireDateEn)}</strong> to <strong>${end}</strong>.</p>
<p>During the period of service, the employee carried out assigned duties in accordance with company standards.</p>
${signatoryEn(ctx)}
`.trim();
  const endAr = employed ? "حتى الآن" : f(ctx.fields.employmentEndDate);
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">نشهد بأن <strong>${esc(ctx.employeeNameAr)}</strong> عمل/تعمل لدى <strong>${esc(ctx.companyNameAr)}</strong> بصفة <strong>${esc(ctx.position)}</strong> خلال الفترة من <strong>${esc(ctx.hireDateAr)}</strong> إلى <strong>${endAr}</strong>.</p>
<p dir="rtl">وقد أدى/ت أدت المهام الموكلة وفق معايير العمل المعتمدة.</p>
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderPromotion(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear <strong>${esc(ctx.employeeNameEn)}</strong>,</p>
<p>Further to internal approval reference <strong>${f(ctx.fields.approvalReference)}</strong>, you are hereby notified of your promotion from <strong>${ft(ctx.fields.previousTitle)}</strong> to <strong>${ft(ctx.fields.newTitle)}</strong>, effective <strong>${f(ctx.fields.promotionEffectiveDate)}</strong>.</p>
<p>All other terms and conditions remain subject to your employment contract and company policies.</p>
${signatoryEn(ctx)}
`.trim();
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">نحيطكم علماً بموجب الموافقة رقم <strong>${f(ctx.fields.approvalReference)}</strong> بترقيتكم من <strong>${f(ctx.fields.previousTitle)}</strong> إلى <strong>${f(ctx.fields.newTitle)}</strong> اعتباراً من <strong>${f(ctx.fields.promotionEffectiveDate)}</strong>.</p>
<p dir="rtl">ويظل باقي شروط العمل وفق العقد والأنظمة المعمول بها.</p>
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderSalaryTransfer(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear Sir/Madam,</p>
<p>We hereby confirm that <strong>${esc(ctx.employeeNameEn)}</strong> is employed with <strong>${esc(ctx.companyNameEn)}</strong> and receives a monthly salary of <strong>${esc(ctx.salaryFormatted)}</strong>. The employee has requested that salary be credited to <strong>${f(ctx.fields.bankName)}</strong>.</p>
<p>Please extend the usual cooperation to complete the necessary formalities.</p>
${signatoryEn(ctx)}
`.trim();
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">نؤكد أن <strong>${esc(ctx.employeeNameAr)}</strong> يعمل/تعمل لدى <strong>${esc(ctx.companyNameAr)}</strong> ويستحق/تستحق راتباً شهرياً قدره <strong>${esc(ctx.salaryFormatted)}</strong>، وقد طلب/ت توجيه الراتب إلى <strong>${f(ctx.fields.bankName)}</strong>.</p>
<p dir="rtl">وتفضلوا بقبول التزاماتكم المعتادة لاستكمال الإجراءات.</p>
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderLeave(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear Sir/Madam,</p>
<p>This letter confirms that <strong>${esc(ctx.employeeNameEn)}</strong> has been granted <strong>${f(ctx.fields.leaveType)}</strong> leave from <strong>${f(ctx.fields.leaveStart)}</strong> to <strong>${f(ctx.fields.leaveEnd)}</strong>, with expected return on <strong>${f(ctx.fields.returnDate)}</strong>.</p>
${signatoryEn(ctx)}
`.trim();
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">نؤكد منح <strong>${esc(ctx.employeeNameAr)}</strong> إجازة <strong>${f(ctx.fields.leaveType)}</strong> من <strong>${f(ctx.fields.leaveStart)}</strong> إلى <strong>${f(ctx.fields.leaveEnd)}</strong>، على أن يكون العودة المتوقعة في <strong>${f(ctx.fields.returnDate)}</strong>.</p>
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

function renderWarning(ctx: LetterRenderContext, subjectEn: string, subjectAr: string) {
  const bodyEn = `
${metaBlockEn(ctx, subjectEn)}
<p>Dear <strong>${esc(ctx.employeeNameEn)}</strong>,</p>
<p>Further to the incident on <strong>${f(ctx.fields.incidentDate)}</strong> concerning <strong>${f(ctx.fields.policyCategory)}</strong>, the following factual summary is recorded: ${esc(ctx.fields.factualSummary ?? "")}</p>
<p>The company expects the following corrective action: ${esc(ctx.fields.correctiveExpectation ?? "")}</p>
<p>Failure to comply may result in further disciplinary measures in line with company policy and applicable law.</p>
<p>Acknowledgement: I acknowledge receipt of this letter.</p>
${signatoryEn(ctx)}
`.trim();
  const bodyAr = `
${metaBlockAr(ctx, subjectAr)}
<p dir="rtl">إشارةً إلى واقعة يوم <strong>${f(ctx.fields.incidentDate)}</strong> بخصوص <strong>${f(ctx.fields.policyCategory)}</strong>، نورد الملخص التالي: ${esc(ctx.fields.factualSummary ?? "")}</p>
<p dir="rtl">ويتعين على الموظف الالتزام بما يلي: ${esc(ctx.fields.correctiveExpectation ?? "")}</p>
<p dir="rtl">وعدم الالتزام قد يترتب عليه إجراءات تأديبية أخرى وفق السياسة والأنظمة.</p>
<p dir="rtl">أُقر باستلام هذا الخطاب.</p>
${signatoryAr(ctx)}
`.trim();
  return { subject: pickSubject(ctx.language, subjectEn, subjectAr), bodyEn, bodyAr };
}

export function applyLanguageMode(
  language: LetterLanguageMode,
  bodyEn: string | null,
  bodyAr: string | null
): { bodyEn: string | null; bodyAr: string | null } {
  if (language === "en") return { bodyEn, bodyAr: null };
  if (language === "ar") return { bodyEn: null, bodyAr };
  return { bodyEn, bodyAr };
}
