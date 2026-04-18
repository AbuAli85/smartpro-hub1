import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";

export { toWhatsAppPhoneDigits };

/**
 * WhatsApp click-to-chat — opens the app or web with a draft message.
 *
 * Uses `api.whatsapp.com/send` instead of `wa.me` because some DNS / corporate filters
 * return NXDOMAIN for `wa.me` while `api.whatsapp.com` still resolves (same official flow).
 *
 * @param phoneDigits International number without "+" (e.g. 96892345678)
 */
export function buildWhatsAppMessageHref(phoneDigits: string, message: string): string {
  const params = new URLSearchParams();
  params.set("phone", phoneDigits);
  params.set("text", message);
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

/**
 * Arabic outreach draft for directory row "Open WhatsApp".
 * Official / formal register with cautious legal framing: administrative contact only, no contract by message alone.
 */
export function buildSanadDirectoryOutreachBodyAr(centerName: string): string {
  const name = centerName.trim() || "البيان كما ورد في السجلّ";
  return [
    "السلام عليكم ورحمة الله وبركاته،",
    "",
    "تحية طيبة وبعد،",
    "",
    "السادةَ الفاضلين،",
    "",
    "نخاطبكم — باسم منصة «سمارت برو» SmartPRO للخدمات المهنية، سلطنة عُمان — في إطار التواصل المؤسسي الرسمي المتعلق ببرنامج شركاء «سند»، وفق السياسات والإجراءات الداخلية المعتمدة لدى المنصة.",
    "",
    "البيان المرجعي (كما هو مسجّل لدى المنصة):",
    name,
    "",
    "نرجو — إن رغبتم — الإفادة بمدى رغبتكم في متابعة المسار الإداري المشار إليه أعلاه، أو بأي استفسارٍ يتعلق به، وذلك بالرد على هذه الرسالة عبر هذه القناة.",
    "",
    "تنويه: لا يُعدّ هذا التواصل بمفرده عرضاً تعاقدياً ملزماً أو عقداً؛ وأي التزامٍ تعاقديٍ أو إجراءاتٍ نهائيةٍ تكون خاضعةً للوثائق والشروط والقنوات الرسمية المعتمدة لدى المنصة واستكمال المتطلبات النظامية ذات الصلة.",
    "",
    "ولكم منّا فائق الاحترام والتقدير،",
    "الشؤون المؤسسية والعلاقات — SmartPRO",
  ].join("\n");
}
