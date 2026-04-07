/**
 * Deep links: `/quotations?quote=<id>`, `?contact=<id>&new=1`, `?deal=<id>`, `?filter=accepted`.
 */

export type QuotationUrlParams = {
  quoteId: number | null;
  contactId: number | null;
  dealId: number | null;
  newRequest: boolean;
  filter: string | null;
};

export function parseQuotationUrlParams(search: string): QuotationUrlParams {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(q);
  const num = (key: string) => {
    const raw = p.get(key);
    if (raw == null || raw === "") return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    quoteId: num("quote"),
    contactId: num("contact"),
    dealId: num("deal"),
    newRequest: p.get("new") === "1",
    filter: p.get("filter"),
  };
}
