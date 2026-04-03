import { TRPCError } from "@trpc/server";
import { eq, asc } from "drizzle-orm";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { sendContractSigningEmail } from "../email";
import {
  createContract,
  getAllContracts,
  getContractById,
  getContractTemplates,
  getContracts,
  getUserCompany,
  updateContract,
  getDb,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  assertContractReadable,
  assertContractSignersVisible,
  assertRowBelongsToActiveCompany,
  assertSignatureActor,
  requireActiveCompanyId,
} from "../_core/tenant";
import { invokeLLM } from "../_core/llm";
import { contractSignatures, contractSignatureAudit, contracts } from "../../drizzle/schema";

export const contractsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), type: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (canAccessGlobalAdminProcedures(ctx.user)) return getAllContracts({ status: input.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getContracts(membership.company.id, input);
    }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const contract = await getContractById(input.id);
    if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
    await assertContractReadable(ctx.user, input.id);
    return contract;
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(2),
        titleAr: z.string().optional(),
        type: z.enum(["employment", "service", "nda", "partnership", "vendor", "lease", "other"]),
        partyAName: z.string().optional(),
        partyBName: z.string().optional(),
        value: z.number().optional(),
        currency: z.string().default("OMR"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        content: z.string().optional(),
        templateId: z.number().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const contractNumber = "CON-" + Date.now() + "-" + nanoid(4).toUpperCase();
      await createContract({
        ...input,
        companyId,
        createdBy: ctx.user.id,
        contractNumber,
        value: input.value ? String(input.value) : undefined,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
      return { success: true, contractNumber };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        status: z
          .enum(["draft", "pending_review", "pending_signature", "signed", "active", "expired", "terminated", "cancelled"])
          .optional(),
        content: z.string().optional(),
        partyAName: z.string().optional(),
        partyBName: z.string().optional(),
        value: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const existing = await getContractById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Contract");
      const updateData: any = { ...data };
      if (data.value !== undefined) updateData.value = String(data.value);
      if (data.startDate) updateData.startDate = new Date(data.startDate);
      if (data.endDate) updateData.endDate = new Date(data.endDate);
      if (data.status === "signed") updateData.signedAt = new Date();
      await updateContract(id, updateData);
      return { success: true };
    }),

  templates: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    return getContractTemplates(membership?.company.id);
  }),

  generateFromTemplate: protectedProcedure
    .input(z.object({
      type: z.enum(["employment", "service", "nda", "partnership", "vendor", "lease", "other"]),
      partyAName: z.string(),
      partyBName: z.string(),
      value: z.number().optional(),
      currency: z.string().default("OMR"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      jurisdiction: z.string().default("Oman"),
      additionalClauses: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const typeLabels: Record<string, string> = {
        employment: "Employment Contract",
        service: "Service Agreement",
        nda: "Non-Disclosure Agreement",
        partnership: "Partnership Agreement",
        vendor: "Vendor Agreement",
        lease: "Lease Agreement",
        other: "General Agreement",
      };
      const contractType = typeLabels[input.type] ?? "Agreement";
      const prompt = `Generate a professional ${contractType} for the following parties:
- Party A (Employer/Client): ${input.partyAName}
- Party B (Employee/Service Provider): ${input.partyBName}
${input.value ? `- Contract Value: ${input.value} ${input.currency}` : ""}
${input.startDate ? `- Start Date: ${input.startDate}` : ""}
${input.endDate ? `- End Date: ${input.endDate}` : ""}
- Jurisdiction: ${input.jurisdiction}
${input.additionalClauses ? `- Additional Requirements: ${input.additionalClauses}` : ""}

Generate a complete, professional contract document with all standard clauses for this type of agreement under ${input.jurisdiction} law. Format it with clear section headings, numbered clauses, and signature blocks. Return only the contract text, no preamble.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a legal document specialist for GCC business contracts. Generate professional, legally-sound contract documents following Omani and GCC commercial law standards. Use formal legal language." },
          { role: "user", content: prompt },
        ],
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      return { content, contractType };
    }),

  exportHtml: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      await assertRowBelongsToActiveCompany(ctx.user, contract.companyId, "Contract");
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${contract.title}</title>
<style>
  body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 40px; line-height: 1.8; color: #1a1a1a; }
  h1 { text-align: center; font-size: 20px; text-transform: uppercase; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 24px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; font-size: 13px; }
  .meta span { color: #555; } .meta strong { color: #1a1a1a; }
  .content { white-space: pre-wrap; font-size: 13px; }
  .signatures { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sig-block { border-top: 1px solid #333; padding-top: 8px; font-size: 12px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${contract.title}</h1>
<div class="meta">
  <div><span>Contract No:</span> <strong>${contract.contractNumber}</strong></div>
  <div><span>Status:</span> <strong>${contract.status?.toUpperCase()}</strong></div>
  <div><span>Party A:</span> <strong>${contract.partyAName ?? "—"}</strong></div>
  <div><span>Party B:</span> <strong>${contract.partyBName ?? "—"}</strong></div>
  <div><span>Value:</span> <strong>${contract.value ? `${contract.value} ${contract.currency}` : "—"}</strong></div>
  <div><span>Jurisdiction:</span> <strong>Oman</strong></div>
  ${contract.startDate ? `<div><span>Start Date:</span> <strong>${new Date(contract.startDate).toLocaleDateString()}</strong></div>` : ""}
  ${contract.endDate ? `<div><span>End Date:</span> <strong>${new Date(contract.endDate).toLocaleDateString()}</strong></div>` : ""}
</div>
<div class="content">${contract.content ?? "No content provided."}</div>
<div class="signatures">
  <div class="sig-block"><p>Party A: ${contract.partyAName ?? "_______________"}</p><p>Signature: _______________</p><p>Date: _______________</p></div>
  <div class="sig-block"><p>Party B: ${contract.partyBName ?? "_______________"}</p><p>Signature: _______________</p><p>Date: _______________</p></div>
</div>
</body></html>`;
      return { html, title: contract.title, contractNumber: contract.contractNumber };
    }),

  // ── E-Signature Procedures ────────────────────────────────────────────────────
  addSigner: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      signerName: z.string().min(2),
      signerEmail: z.string().email(),
      signerRole: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const c = await getContractById(input.contractId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await assertRowBelongsToActiveCompany(ctx.user, c.companyId, "Contract");
      const [result] = await db.insert(contractSignatures).values({
        contractId: input.contractId,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        signerRole: input.signerRole,
        status: "pending",
      });
      const insertId = (result as any).insertId as number;
      await db.insert(contractSignatureAudit).values({
        contractId: input.contractId,
        signatureId: insertId,
        event: "requested",
        actorName: ctx.user.name,
        actorEmail: ctx.user.email ?? undefined,
        notes: `Signature requested from ${input.signerName} <${input.signerEmail}>`,
      });
      await updateContract(input.contractId, { status: "pending_signature" });
      // Send signing notification email to the signer
      const signingUrl = `${(ctx as any).origin ?? ""}/contracts/${input.contractId}/sign`;
      await sendContractSigningEmail({
        to: input.signerEmail,
        signerName: input.signerName,
        contractTitle: c.title,
        companyName: ctx.user.name ?? "SmartPRO",
        signingUrl,
      }).catch((e) => console.error("[Email] addSigner signing email failed (non-fatal):", e));
      return { id: insertId };
    }),

  listSigners: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertContractSignersVisible(ctx.user, input.contractId);
      const db = await getDb();
      if (!db) return [];
      return db.select().from(contractSignatures)
        .where(eq(contractSignatures.contractId, input.contractId))
        .orderBy(asc(contractSignatures.createdAt));
    }),

  submitSignature: protectedProcedure
    .input(z.object({
      signatureId: z.number(),
      signatureDataUrl: z.string(), // base64 PNG from canvas
      ipAddress: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [signer] = await db.select().from(contractSignatures)
        .where(eq(contractSignatures.id, input.signatureId)).limit(1);
      if (!signer) throw new TRPCError({ code: "NOT_FOUND" });
      await assertSignatureActor(ctx.user, signer.signerEmail);
      if (signer.status === "signed") throw new TRPCError({ code: "BAD_REQUEST", message: "Already signed" });
      const [contractRow] = await db
        .select({ companyId: contracts.companyId })
        .from(contracts)
        .where(eq(contracts.id, signer.contractId))
        .limit(1);
      if (contractRow?.companyId == null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
      }
      const sigCompanyId = contractRow.companyId;
      // Store signature image in S3
      const base64Data = input.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const key = `signatures/${sigCompanyId}/${signer.contractId}/${input.signatureId}-${Date.now()}.png`;
      const { url } = await storagePut(key, buffer, "image/png");
      await db.update(contractSignatures).set({
        status: "signed",
        signedAt: new Date(),
        signatureUrl: url,
        ipAddress: input.ipAddress,
      }).where(eq(contractSignatures.id, input.signatureId));
      await db.insert(contractSignatureAudit).values({
        contractId: signer.contractId,
        signatureId: input.signatureId,
        event: "signed",
        actorName: signer.signerName,
        actorEmail: signer.signerEmail,
        ipAddress: input.ipAddress,
        notes: `Signed by ${signer.signerName}`,
      });
      // Check if all signers have signed → mark contract as signed
      const allSigners = await db.select().from(contractSignatures)
        .where(eq(contractSignatures.contractId, signer.contractId));
      const allSigned = allSigners.every(s => s.status === "signed");
      if (allSigned) {
        await updateContract(signer.contractId, { status: "signed", signedAt: new Date() });
        await db.insert(contractSignatureAudit).values({
          contractId: signer.contractId,
          event: "completed",
          notes: "All parties have signed. Contract is fully executed.",
        });
      }
      return { ok: true, allSigned, signatureUrl: url };
    }),

  declineSignature: protectedProcedure
    .input(z.object({ signatureId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [signer] = await db.select().from(contractSignatures)
        .where(eq(contractSignatures.id, input.signatureId)).limit(1);
      if (!signer) throw new TRPCError({ code: "NOT_FOUND" });
      await assertSignatureActor(ctx.user, signer.signerEmail);
      await db.update(contractSignatures).set({ status: "declined" })
        .where(eq(contractSignatures.id, input.signatureId));
      await db.insert(contractSignatureAudit).values({
        contractId: signer.contractId,
        signatureId: input.signatureId,
        event: "declined",
        actorName: signer.signerName,
        actorEmail: signer.signerEmail,
        notes: input.reason ?? "Declined without reason",
      });
      return { ok: true };
    }),

  getSignatureAuditTrail: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertContractSignersVisible(ctx.user, input.contractId);
      const db = await getDb();
      if (!db) return [];
      return db.select().from(contractSignatureAudit)
        .where(eq(contractSignatureAudit.contractId, input.contractId))
        .orderBy(asc(contractSignatureAudit.createdAt));
    }),

  exportSignedHtml: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      await assertRowBelongsToActiveCompany(ctx.user, contract.companyId, "Contract");
      const cid = contract.companyId!;
      const signers = await db.select().from(contractSignatures)
        .where(eq(contractSignatures.contractId, input.id))
        .orderBy(asc(contractSignatures.createdAt));
      const sigBlocks = signers.map(s => `
        <div class="sig-block">
          <p><strong>${s.signerRole ?? "Signatory"}</strong>: ${s.signerName}</p>
          ${s.signatureUrl
          ? `<img src="${s.signatureUrl}" style="max-height:60px;border-bottom:1px solid #333;" alt="signature" />`
          : `<div style="border-bottom:1px solid #333;height:60px;"></div>`}
          <p style="font-size:11px;color:#666">${s.status === "signed" && s.signedAt
          ? `Signed: ${new Date(s.signedAt).toLocaleString()}`
          : (s.status ?? "pending").toUpperCase()}</p>
          ${s.ipAddress ? `<p style="font-size:10px;color:#999">IP: ${s.ipAddress}</p>` : ""}
        </div>`).join("");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${contract.title} — Signed</title>
<style>
body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:40px;line-height:1.8;color:#1a1a1a}
h1{text-align:center;font-size:20px;text-transform:uppercase;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:24px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px;font-size:13px}
.content{white-space:pre-wrap;font-size:13px}
.signatures{margin-top:60px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:30px}
.sig-block{border-top:2px solid #1a1a1a;padding-top:12px;font-size:12px}
.badge{display:inline-block;background:#166534;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-bottom:8px}
</style></head><body>
<div class="badge">✓ FULLY EXECUTED</div>
<h1>${contract.title}</h1>
<div class="meta">
  <div><span>Contract No: </span><strong>${contract.contractNumber}</strong></div>
  <div><span>Status: </span><strong>SIGNED</strong></div>
  <div><span>Party A: </span><strong>${contract.partyAName ?? "—"}</strong></div>
  <div><span>Party B: </span><strong>${contract.partyBName ?? "—"}</strong></div>
  ${contract.signedAt ? `<div><span>Signed: </span><strong>${new Date(contract.signedAt).toLocaleDateString()}</strong></div>` : ""}
</div>
<div class="content">${contract.content ?? "No content."}</div>
<div class="signatures">${sigBlocks}</div>
</body></html>`;
      const key = `contracts/${cid}/signed/${input.id}-${contract.contractNumber?.replace(/[^a-zA-Z0-9]/g, "-")}-signed-${Date.now()}.html`;
      const { url } = await storagePut(key, Buffer.from(html, "utf-8"), "text/html");
      await updateContract(input.id, { pdfUrl: url });
      return { url, title: contract.title };
    }),

  // Store the contract HTML as a file in S3 and return a persistent download URL
  saveToStorage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      await assertRowBelongsToActiveCompany(ctx.user, contract.companyId, "Contract");
      const cid = contract.companyId!;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${contract.title}</title><style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:40px;line-height:1.8;color:#1a1a1a}h1{text-align:center;font-size:20px;text-transform:uppercase;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:24px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px;font-size:13px}.content{white-space:pre-wrap;font-size:13px}.signatures{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.sig-block{border-top:1px solid #333;padding-top:8px;font-size:12px}@media print{body{margin:0}}</style></head><body><h1>${contract.title}</h1><div class="meta"><div><span>Contract No:</span><strong>${contract.contractNumber}</strong></div><div><span>Status:</span><strong>${contract.status?.toUpperCase()}</strong></div><div><span>Party A:</span><strong>${contract.partyAName ?? "—"}</strong></div><div><span>Party B:</span><strong>${contract.partyBName ?? "—"}</strong></div>${contract.value ? `<div><span>Value:</span><strong>${contract.value} ${contract.currency}</strong></div>` : ""}</div><div class="content">${contract.content ?? "No content."}</div><div class="signatures"><div class="sig-block"><p>Party A: ${contract.partyAName ?? "___"}</p><p>Signature: _______________</p><p>Date: _______________</p></div><div class="sig-block"><p>Party B: ${contract.partyBName ?? "___"}</p><p>Signature: _______________</p><p>Date: _______________</p></div></div></body></html>`;
      const fileKey = `contracts/${cid}/${input.id}-${contract.contractNumber?.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}.html`;
      const { url } = await storagePut(fileKey, Buffer.from(html, "utf-8"), "text/html");
      await updateContract(input.id, { pdfUrl: url });
      return { url, fileKey, title: contract.title };
    }),
});
