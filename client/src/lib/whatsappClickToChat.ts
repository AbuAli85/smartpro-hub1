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
