export {
  seesPlatformOperatorNav,
  isCompanyOwnerNav,
  seesLeadershipCompanyNav,
  isPortalClientNav,
  OPTIONAL_NAV_HREFS,
} from "@shared/clientNav";

const NAV_PREFS_KEY = "smartpro-nav-hidden";

export function getHiddenNavHrefs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NAV_PREFS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function setHiddenNavHrefs(hrefs: Set<string>): void {
  localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(Array.from(hrefs)));
}

export function toggleNavHrefHidden(href: string, hidden: boolean): void {
  const s = getHiddenNavHrefs();
  if (hidden) s.add(href);
  else s.delete(href);
  setHiddenNavHrefs(s);
}

export function notifyNavPreferencesChanged(): void {
  window.dispatchEvent(new Event("smartpro-nav-prefs-changed"));
}
