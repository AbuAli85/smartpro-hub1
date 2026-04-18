import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";

export { toWhatsAppPhoneDigits };

/** E.164-style digits without leading "+", as used by WhatsApp click-to-chat (typically 10–15 digits). */
export function isValidWhatsAppPhoneDigits(phoneDigits: string): boolean {
  const d = phoneDigits.trim();
  if (!/^\d+$/.test(d)) return false;
  if (d.length < 10 || d.length > 15) return false;
  return true;
}

/**
 * WhatsApp click-to-chat — opens the app or web with a draft message.
 *
 * Uses `api.whatsapp.com/send` instead of `wa.me` because some DNS / corporate filters
 * return NXDOMAIN for `wa.me` while `api.whatsapp.com` still resolves (same official flow).
 *
 * @returns `null` when phone digits are invalid or the message is empty after trim.
 */
export function buildWhatsAppMessageHref(phoneDigits: string, message: string): string | null {
  const phone = phoneDigits.trim();
  if (!isValidWhatsAppPhoneDigits(phone)) return null;
  const text = message.trim();
  if (!text) return null;
  const params = new URLSearchParams();
  params.set("phone", phone);
  params.set("text", text);
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

/** Same as {@link buildWhatsAppMessageHref} after normalizing `raw` with {@link toWhatsAppPhoneDigits}. */
export function buildWhatsAppMessageHrefFromRawPhone(rawPhone: string, message: string): string | null {
  const digits = toWhatsAppPhoneDigits(rawPhone);
  if (!digits) return null;
  return buildWhatsAppMessageHref(digits, message);
}

/**
 * Official Arabic body for Sanad directory / partner outreach (WhatsApp).
 *
 * «المندوب الذكي» is framed as a **digital initiative**, not a person.
 * Optional blocks are omitted when `centerName` / `joinUrl` / `surveyUrl` are empty after trim
 * so the message stays clean on mobile and when links are not yet available.
 */
export function buildSanadDirectoryOutreachBodyAr(
  centerName: string,
  joinUrl: string,
  surveyUrl: string,
): string {
  const name = centerName.trim();
  const join = joinUrl.trim();
  const survey = surveyUrl.trim();
  const hasJoin = join.length > 0;
  const hasSurvey = survey.length > 0;

  const sections: string[] = [];

  sections.push(
    [
      "السلام عليكم ورحمة الله وبركاته،",
      "",
      "تحية طيبة وبعد،",
      "",
      "نودّ إفادتكم بأن «المندوب الذكي» — مبادرة رقمية متخصصة في تطوير وتنظيم الخدمات المهنية في سلطنة عُمان — يعمل حالياً على تنفيذ مسارات تنسيق تهدف إلى تعزيز التكامل ورفع كفاءة الخدمات والتعاملات المرتبطة بمراكز «سند» المعتمدة.",
    ].join("\n"),
  );

  if (name) {
    sections.push(["بيانات المركز المسجّلة لدينا:", name].join("\n"));
  }

  if (hasJoin || hasSurvey) {
    sections.push(
      "وعليه، نأمل التكرم بالإفادة حول مدى جاهزيتكم لاستكمال إجراءات التنسيق والتفعيل، وذلك عبر أحد الخيارات التالية:",
    );
    if (hasJoin) {
      sections.push(["طلب الانضمام والتفعيل عبر الرابط التالي:", join].join("\n"));
    }
    if (hasSurvey) {
      sections.push(["المشاركة في الاستبيان المختصر لتطوير الخدمات:", survey].join("\n"));
    }
  } else {
    sections.push(
      "وعليه، نأمل التكرم بالإفادة حول مدى جاهزيتكم لاستكمال إجراءات التنسيق والتفعيل، أو بأي استفسار ذي صلة، عبر الرد المباشر على هذه الرسالة.",
    );
  }

  sections.push(
    [
      "كما يمكنكم — عند الحاجة — الاكتفاء بالرد المباشر على هذه الرسالة للتواصل أو الاستفسار.",
      "",
      "يرجى العلم بأن هذا التواصل يُعدّ لأغراض تنظيمية أولية، ولا يترتب عليه التزام تعاقدي بذاته، وأي إجراءات رسمية لاحقة تتم وفق الأنظمة والقنوات المعتمدة.",
      "",
      "شاكرين تعاونكم،",
      "وتفضلوا بقبول فائق الاحترام والتقدير،",
      "",
      "المندوب الذكي",
      "الشؤون المؤسسية والعلاقات",
      "سلطنة عُمان",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
