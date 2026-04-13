declare module "isomorphic-dompurify" {
  interface DOMPurifyLike {
    sanitize(dirty: string, cfg?: { USE_PROFILES?: { html?: boolean } }): string;
  }
  const DOMPurify: DOMPurifyLike;
  export default DOMPurify;
}
