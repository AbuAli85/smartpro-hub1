/** Mirrors server normalizeAttachmentLinks — keep rules in sync with server/routers/tasks.ts */

export function normalizeAttachmentLinks(
  links: { name: string; url: string }[] | null | undefined,
): { name: string; url: string }[] | null {
  if (!links?.length) return null;
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const raw of links) {
    const name = raw.name.trim().slice(0, 60);
    let url = raw.url.trim().replace(/\s+/g, "");
    if (url.length > 500) url = url.slice(0, 500);
    if (!name || !url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const key = parsed.href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, url: parsed.href });
    if (out.length >= 5) break;
  }
  return out.length ? out : null;
}
