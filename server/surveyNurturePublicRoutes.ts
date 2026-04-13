/**
 * GET /api/survey/nurture/unsubscribe?token= — one-click unsubscribe from survey nurture emails.
 * Token is the survey resume token (same secret as resume links).
 */
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { surveyResponses } from "../drizzle/schema";

export function registerSurveyNurturePublicRoutes(app: Express) {
  app.get("/api/survey/nurture/unsubscribe", async (req, res) => {
    const token = req.query.token;
    if (typeof token !== "string" || token.length < 8 || token.length > 64) {
      res.status(400).type("html").send(page("Invalid link", "This unsubscribe link is not valid."));
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).type("html").send(page("Unavailable", "Please try again later."));
      return;
    }

    const [row] = await db
      .select({ id: surveyResponses.id })
      .from(surveyResponses)
      .where(eq(surveyResponses.resumeToken, token))
      .limit(1);

    if (!row) {
      res.status(404).type("html").send(page("Not found", "We could not find this survey response."));
      return;
    }

    await db
      .update(surveyResponses)
      .set({
        nurtureStoppedAt: new Date(),
        nurtureStoppedReason: "unsubscribed",
      })
      .where(eq(surveyResponses.id, row.id));

    res
      .type("html")
      .send(
        page(
          "Unsubscribed",
          "You will no longer receive reminder emails about joining SmartPRO Hub from this survey. Thank you for your feedback.",
        ),
      );
  });
}

function page(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeAttr(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; color: #1e293b; }
    h1 { font-size: 1.25rem; margin-bottom: 0.75rem; }
    p { line-height: 1.6; color: #64748b; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
