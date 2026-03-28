import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createContract,
  getAllContracts,
  getContractById,
  getContractTemplates,
  getContracts,
  getUserCompany,
  updateContract,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

export const contractsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), type: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "admin") return getAllContracts({ status: input.status });
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      return getContracts(membership.company.id, input);
    }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const contract = await getContractById(input.id);
    if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
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
      const membership = await getUserCompany(ctx.user.id);
      const companyId = membership?.company.id ?? 1;
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
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

  // ── Google Docs-style template generation using LLM ──────────────────────────────────────────────────────
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

  // ── Export contract as formatted HTML (for print/PDF) ──────────────────────────────────────────────────────
  exportHtml: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
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

  // Store the contract HTML as a file in S3 and return a persistent download URL
  saveToStorage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });

      // Build print-ready HTML (same as exportHtml)
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${contract.title}</title><style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:40px;line-height:1.8;color:#1a1a1a}h1{text-align:center;font-size:20px;text-transform:uppercase;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:24px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px;font-size:13px}.content{white-space:pre-wrap;font-size:13px}.signatures{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.sig-block{border-top:1px solid #333;padding-top:8px;font-size:12px}@media print{body{margin:0}}</style></head><body><h1>${contract.title}</h1><div class="meta"><div><span>Contract No:</span><strong>${contract.contractNumber}</strong></div><div><span>Status:</span><strong>${contract.status?.toUpperCase()}</strong></div><div><span>Party A:</span><strong>${contract.partyAName ?? "—"}</strong></div><div><span>Party B:</span><strong>${contract.partyBName ?? "—"}</strong></div>${contract.value ? `<div><span>Value:</span><strong>${contract.value} ${contract.currency}</strong></div>` : ""}</div><div class="content">${contract.content ?? "No content."}</div><div class="signatures"><div class="sig-block"><p>Party A: ${contract.partyAName ?? "___"}</p><p>Signature: _______________</p><p>Date: _______________</p></div><div class="sig-block"><p>Party B: ${contract.partyBName ?? "___"}</p><p>Signature: _______________</p><p>Date: _______________</p></div></div></body></html>`;

      const fileKey = `contracts/${input.id}-${contract.contractNumber?.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}.html`;
      const { url } = await storagePut(fileKey, Buffer.from(html, "utf-8"), "text/html");

      // Persist the download URL on the contract record
      await updateContract(input.id, { pdfUrl: url });

      return { url, fileKey, title: contract.title };
    }),
});
