import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { ENV } from "../../_core/env";
import { DocumentGenerationError } from "./documentGeneration.types";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

function parseServiceAccount(): { clientEmail: string; privateKey: string } {
  const raw = ENV.googleDocsServiceAccountJson?.trim();
  if (!raw) {
    throw new DocumentGenerationError(
      "INTERNAL_ERROR",
      "Google Docs is not configured: set GOOGLE_DOCS_SERVICE_ACCOUNT_JSON"
    );
  }
  try {
    const j = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!j.client_email || !j.private_key) {
      throw new Error("service account JSON must include client_email and private_key");
    }
    return { clientEmail: j.client_email, privateKey: j.private_key.replace(/\\n/g, "\n") };
  } catch (e) {
    throw new DocumentGenerationError(
      "INTERNAL_ERROR",
      "Invalid GOOGLE_DOCS_SERVICE_ACCOUNT_JSON",
      { cause: e }
    );
  }
}

function createJwtClient(): JWT {
  const { clientEmail, privateKey } = parseServiceAccount();
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [DRIVE_FILE_SCOPE, DOCS_SCOPE],
  });
}

export type GoogleDocsClientDeps = {
  copyTemplate: (templateGoogleDocId: string, title?: string) => Promise<string>;
  replacePlaceholders: (googleDocId: string, values: Record<string, string>) => Promise<void>;
  exportAsPdf: (googleDocId: string) => Promise<Buffer>;
};

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
        const res = await drive.files.copy({
          fileId: templateGoogleDocId,
          requestBody: {
            name: title ?? `Generated ${new Date().toISOString().slice(0, 10)}`,
          },
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
  };
}
