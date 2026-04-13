/**
 * WhatsApp click-to-chat (https://wa.me/) — opens the app or web with a draft message.
 * Phone digits must not include "+" (Oman: prefix 968 when 8 local digits are given).
 */
export function toWhatsAppPhoneDigits(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("968") && d.length === 8) d = `968${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

export function buildWhatsAppMessageHref(phoneDigits: string, message: string): string {
  const params = new URLSearchParams();
  params.set("text", message);
  return `https://wa.me/${phoneDigits}?${params.toString()}`;
}
