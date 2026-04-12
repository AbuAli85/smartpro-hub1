import DOMPurify from "isomorphic-dompurify";

/** Strip scripts/event handlers from LLM-produced letter HTML before storage or public render. */
export function sanitizeLetterHtml(html: string | null | undefined): string | null {
  if (html == null || html === "") return html == null ? null : "";
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return clean.length ? clean : null;
}
