import { createPrivateKey } from "node:crypto";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { normalizeServiceAccountPrivateKeyPem } from "../../_core/googleServiceAccountPem";
import { parseServiceAccountJsonString } from "../../_core/parseServiceAccountJson";
import { DocumentGenerationError } from "./documentGeneration.types";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

function parseServiceAccount(): { clientEmail: string; privateKey: string } {
  const raw = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON ?? "";
  const j = parseServiceAccountJsonString(raw);
  if (!j) {
    throw new DocumentGenerationError(
      "NOT_CONFIGURED",
      "PDF generation is not available: set GOOGLE_DOCS_SERVICE_ACCOUNT_JSON to the full service account JSON from Google Cloud (valid JSON with client_email and private_key). If the secret UI only accepts one line, paste the JSON as one line or base64-encode the whole JSON."
    );
  }
  const privateKey = normalizeServiceAccountPrivateKeyPem(j.private_key);
  try {
    createPrivateKey(privateKey);
  } catch (e) {
    throw new DocumentGenerationError(
      "NOT_CONFIGURED",
      "Invalid service account private_key: OpenSSL could not load the PEM (often caused by a truncated key or newlines removed when saving the secret). Re-download the JSON key from Google Cloud and paste the full value again.",
      { cause: e }
    );
  }
  return { clientEmail: j.client_email, privateKey };
}

function createJwtClient(): JWT {
  const { clientEmail, privateKey } = parseServiceAccount();
  const impersonateEmail = process.env.GOOGLE_DOCS_IMPERSONATE_EMAIL?.trim();
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [DRIVE_FILE_SCOPE, DOCS_SCOPE],
    ...(impersonateEmail ? { subject: impersonateEmail } : {}),
  });
}

export type GoogleDocsClientDeps = {
  copyTemplate: (templateGoogleDocId: string, title?: string) => Promise<string>;
  replacePlaceholders: (googleDocId: string, values: Record<string, string>) => Promise<void>;
  exportAsPdf: (googleDocId: string) => Promise<Buffer>;
  deleteFile: (fileId: string) => Promise<void>;
  /**
   * Edit the template in place, export PDF, then revert — creates NO files in Drive.
   * Falls back to this when the service account has 0-byte Drive quota.
   */
  fillExportRevert: (templateDocId: string, values: Record<string, string>) => Promise<Buffer>;
};

/**
 * Simple async mutex — serialises in-place template edits so two
 * concurrent generations don't corrupt the shared template doc.
 */
class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) { this.locked = true; return; }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

const templateMutex = new AsyncMutex();

function wrapGoogleError(e: unknown, message: string): never {
  const err = e as { message?: string; code?: number; errors?: { message?: string }[] };
  const detail = err?.errors?.[0]?.message ?? err?.message ?? String(e);
  throw new DocumentGenerationError("INTERNAL_ERROR", `${message}: ${detail}`, { cause: e });
}

export function createLiveGoogleDocsClient(): GoogleDocsClientDeps {
  let jwt: JWT | null = null;
  const getJwt = async () => {
    if (!jwt) jwt = createJwtClient();
    return jwt;
  };

  return {
    async copyTemplate(templateGoogleDocId: string, title?: string): Promise<string> {
      try {
        const auth = await getJwt();
        const drive = google.drive({ version: "v3", auth });
        const sharedDriveId = process.env.GOOGLE_DOCS_SHARED_DRIVE_ID?.trim();
        const requestBody: Record<string, unknown> = {
          name: title ?? `Generated ${new Date().toISOString().slice(0, 10)}`,
        };
        if (sharedDriveId) {
          requestBody.parents = [sharedDriveId];
        }
        const res = await drive.files.copy({
          fileId: templateGoogleDocId,
          requestBody,
          supportsAllDrives: true,
          fields: "id",
        });
        const id = res.data.id;
        if (!id) throw new Error("Drive copy returned no file id");
        return id;
      } catch (e) {
        return wrapGoogleError(e, "Failed to copy Google Doc template");
      }
    },

    async replacePlaceholders(googleDocId: string, values: Record<string, string>): Promise<void> {
      try {
        const auth = await getJwt();
        const docs = google.docs({ version: "v1", auth });
        const requests = Object.entries(values).map(([key, text]) => ({
          replaceAllText: {
            containsText: {
              text: `{{${key}}}`,
              matchCase: true,
            },
            replaceText: text,
          },
        }));
        if (requests.length === 0) return;
        await docs.documents.batchUpdate({
          documentId: googleDocId,
          requestBody: { requests },
        });
      } catch (e) {
        return wrapGoogleError(e, "Failed to replace placeholders in Google Doc");
      }
    },

    async exportAsPdf(googleDocId: string): Promise<Buffer> {
      try {
        const auth = await getJwt();
        const drive = google.drive({ version: "v3", auth });
        const res = await drive.files.export(
          { fileId: googleDocId, mimeType: "application/pdf" },
          { responseType: "arraybuffer" }
        );
        return Buffer.from(res.data as ArrayBuffer);
      } catch (e) {
        return wrapGoogleError(e, "Failed to export Google Doc as PDF");
      }
    },

    async deleteFile(fileId: string): Promise<void> {
      try {
        const auth = await getJwt();
        const drive = google.drive({ version: "v3", auth });
        await drive.files.delete({ fileId, supportsAllDrives: true });
      } catch {
        // Best-effort cleanup — don't fail the generation if delete fails
      }
    },

    async fillExportRevert(templateDocId: string, values: Record<string, string>): Promise<Buffer> {
      const entries = Object.entries(values);
      if (entries.length === 0) {
        return this.exportAsPdf(templateDocId);
      }

      await templateMutex.acquire();
      try {
        const auth = await getJwt();
        const docs = google.docs({ version: "v1", auth });

        const fillRequests = entries.map(([key, text]) => ({
          replaceAllText: {
            containsText: { text: `{{${key}}}`, matchCase: true },
            replaceText: text,
          },
        }));
        await docs.documents.batchUpdate({
          documentId: templateDocId,
          requestBody: { requests: fillRequests },
        });

        const pdfBuffer = await this.exportAsPdf(templateDocId);

        const revertRequests = entries.map(([key, text]) => ({
          replaceAllText: {
            containsText: { text, matchCase: true },
            replaceText: `{{${key}}}`,
          },
        }));
        await docs.documents.batchUpdate({
          documentId: templateDocId,
          requestBody: { requests: revertRequests },
        });

        return pdfBuffer;
      } catch (e) {
        // Best-effort revert on failure
        try {
          const auth = await getJwt();
          const docs = google.docs({ version: "v1", auth });
          const revertRequests = entries.map(([key, text]) => ({
            replaceAllText: {
              containsText: { text, matchCase: true },
              replaceText: `{{${key}}}`,
            },
          }));
          await docs.documents.batchUpdate({
            documentId: templateDocId,
            requestBody: { requests: revertRequests },
          });
        } catch { /* ignore revert errors */ }
        return wrapGoogleError(e, "Failed to generate PDF from template");
      } finally {
        templateMutex.release();
      }
    },
  };
}
