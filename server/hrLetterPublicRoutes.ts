import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { hrLetters } from "../drizzle/schema";
import { getDb, getCompanyById } from "./db";
import { verifyHRLetterViewToken } from "./hrLetterViewToken";
import { sanitizeLetterHtml } from "./_core/sanitizeLetterHtml";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLetterBodyHtml(letter: {
  language: string;
  bodyEn: string | null;
  bodyAr: string | null;
}): string {
  if (letter.language === "both") {
    const en = sanitizeLetterHtml(letter.bodyEn) ?? "";
    const ar = sanitizeLetterHtml(letter.bodyAr) ?? "";
    return `<div class="letter-en">${en}</div><hr class="divider"/><div class="letter-ar" dir="rtl">${ar}</div>`;
  }
  if (letter.language === "ar") {
    return `<div dir="rtl" class="letter-ar">${sanitizeLetterHtml(letter.bodyAr) ?? ""}</div>`;
  }
  return sanitizeLetterHtml(letter.bodyEn) ?? "";
}

export function registerHRLetterPublicRoutes(app: Express): void {
  app.get("/api/hr-letters/view", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      res.status(400).type("text/plain").send("Missing token");
      return;
    }
    const letterId = await verifyHRLetterViewToken(token);
    if (letterId == null) {
      res.status(403).type("text/plain").send("Invalid or expired link");
      return;
    }
    const db = await getDb();
    if (!db) {
      res.status(503).type("text/plain").send("Service unavailable");
      return;
    }
    const rows = await db
      .select()
      .from(hrLetters)
      .where(and(eq(hrLetters.id, letterId), eq(hrLetters.isDeleted, false)))
      .limit(1);
    const letter = rows[0];
    if (!letter) {
      res.status(404).type("text/plain").send("Letter not found");
      return;
    }
    const company = await getCompanyById(letter.companyId);
    const companyName = escapeHtml(company?.name ?? "Company");
    const companyNameAr = company?.nameAr ? escapeHtml(company.nameAr) : "";
    const cr = company?.crNumber ? escapeHtml(company.crNumber) : "";
    const addr = escapeHtml(company?.address ?? company?.city ?? "Muscat, Sultanate of Oman");
    const phone = company?.phone ? escapeHtml(company.phone) : "";
    const email = company?.email ? escapeHtml(company.email) : "";
    const refLine = letter.referenceNumber
      ? `<p class="meta">Ref: <strong>${escapeHtml(letter.referenceNumber)}</strong></p>`
      : "";
    const bodyHtml = buildLetterBodyHtml(letter);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${companyName} — HR Letter</title>
  <style>
    @page { size: A4; margin: 20mm 25mm; }
    body { font-family: "Times New Roman", serif; font-size: 12pt; color: #000; line-height: 1.6; max-width: 800px; margin: 24px auto; padding: 0 16px; }
    .letterhead { border-bottom: 3px double #1a365d; padding-bottom: 12px; margin-bottom: 20px; }
    .company-name { font-size: 16pt; font-weight: bold; color: #1a365d; }
    .company-name-ar { font-size: 14pt; font-weight: bold; color: #1a365d; direction: rtl; margin-top: 4px; }
    .company-meta { font-size: 9pt; color: #555; margin-top: 4px; }
    .letter-body p { margin: 8px 0; }
    .letter-ar { font-family: Arial, sans-serif; }
    .divider { border: none; border-top: 1px solid #ccc; margin: 20px 0; }
    .meta { font-size: 11px; color: #555; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="company-name">${companyName}</div>
    ${companyNameAr ? `<div class="company-name-ar">${companyNameAr}</div>` : ""}
    <div class="company-meta">${cr ? `CR: ${cr} · ` : ""}${addr}</div>
    <div class="company-meta">${[phone, email].filter(Boolean).join(" · ")}</div>
    ${refLine}
  </div>
  <div class="letter-body">${bodyHtml}</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    res.status(200).send(html);
  });
}
