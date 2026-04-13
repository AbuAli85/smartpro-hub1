import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";

export { toWhatsAppPhoneDigits };

/**
 * WhatsApp click-to-chat (https://wa.me/) — opens the app or web with a draft message.
 */

export function buildWhatsAppMessageHref(phoneDigits: string, message: string): string {
  const params = new URLSearchParams();
  params.set("text", message);
  return `https://wa.me/${phoneDigits}?${params.toString()}`;
}
