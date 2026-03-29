/**
 * Forge storage proxy helpers (`BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`).
 *
 * **Access model:** `storagePut` returns a URL minted by the proxy; routers must only return
 * that URL (or DB-persisted copies) after normal tenant/RBAC checks on the owning row.
 * `storageGet` requests a fresh signed download URL for a key — it is **not** used by any
 * tRPC router today; any future caller must re-validate tenant ownership of the key/path
 * before invoking it. Treat returned URLs as sensitive; TTL/expiration is defined by the
 * Forge proxy, not this repo.
 */
import { ENV } from './_core/env';

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * When Forge is configured, client-supplied URLs that claim to point at uploaded objects
 * should share the same origin as `forgeApiUrl` (the storage API base). Skip when unset
 * (e.g. tests) so offline flows keep working.
 */
export function fileUrlMatchesConfiguredStorage(
  fileUrl: string,
  forgeApiUrl: string | undefined
): boolean {
  const base = forgeApiUrl?.trim();
  if (!base) return true;
  try {
    const normalized = base.endsWith("/") ? base : `${base}/`;
    const expectedOrigin = new URL(normalized).origin;
    return new URL(fileUrl).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

/** Upload bytes; returns proxy-issued URL. Caller must enforce tenant scope before exposing the URL. */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

/**
 * Mint a signed download URL for `relKey` via the storage proxy.
 * **Do not** expose to end users without proving the active principal may access that key
 * (e.g. join to a tenant-scoped row whose stored path matches).
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}
