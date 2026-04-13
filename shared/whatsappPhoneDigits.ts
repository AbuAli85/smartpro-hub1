/**
 * Normalize a phone string to WhatsApp Cloud API / click-to-chat digits (no "+").
 * Oman: prefix 968 when 8 local digits are given.
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
