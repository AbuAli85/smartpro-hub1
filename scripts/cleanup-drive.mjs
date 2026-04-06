/**
 * One-time script: deletes ALL files owned by the service account to free Drive quota.
 *
 * Usage:
 *   node scripts/cleanup-drive.mjs <path-to-service-account-key.json>
 *
 * Example:
 *   node scripts/cleanup-drive.mjs "%USERPROFILE%\Downloads\nth-segment-475411-g1-a4ca223e6183.json"
 */

import { google } from "googleapis";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node scripts/cleanup-drive.mjs <service-account-key.json>");
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(keyPath), "utf8"));

const auth = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

let deleted = 0;
let pageToken;

do {
  const res = await drive.files.list({
    q: "'me' in owners",
    fields: "nextPageToken, files(id, name, createdTime, size)",
    pageSize: 100,
    pageToken,
  });

  const files = res.data.files ?? [];
  if (files.length === 0 && deleted === 0) {
    console.log("No files found in the service account Drive.");
    break;
  }

  for (const f of files) {
    const sizeMB = f.size ? (Number(f.size) / 1024 / 1024).toFixed(2) : "?";
    console.log(`Deleting: ${f.name}  (${sizeMB} MB, created ${f.createdTime})`);
    try {
      await drive.files.delete({ fileId: f.id });
      deleted++;
    } catch (e) {
      console.error(`  Failed to delete ${f.id}: ${e.message}`);
    }
  }

  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`\nDone. Deleted ${deleted} file(s). Drive quota should free up shortly.`);
