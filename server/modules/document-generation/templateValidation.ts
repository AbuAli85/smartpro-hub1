import type { DocumentTemplate, DocumentTemplatePlaceholder } from "../../../drizzle/schema";
import { DocumentGenerationError } from "./documentGeneration.types";

export type TemplateWithPlaceholders = {
  template: DocumentTemplate;
  placeholders: DocumentTemplatePlaceholder[];
};

export function assertOutputFormatAllowed(
  template: DocumentTemplate,
  outputFormat: string
): void {
  const allowed = template.outputFormats ?? [];
  if (!allowed.includes(outputFormat)) {
    throw new DocumentGenerationError(
      "VALIDATION_ERROR",
      `Output format "${outputFormat}" is not allowed for this template. Allowed: ${allowed.join(", ")}`
    );
  }
}

export function assertTemplateActive(template: DocumentTemplate): void {
  if (template.status !== "active") {
    throw new DocumentGenerationError(
      "VALIDATION_ERROR",
      `Template "${template.key}" is not active (status: ${template.status}).`
    );
  }
}

export function assertEntityTypeMatches(
  template: DocumentTemplate,
  entityType: string
): void {
  if (template.entityType !== entityType) {
    throw new DocumentGenerationError(
      "VALIDATION_ERROR",
      `Template is for entity type "${template.entityType}", not "${entityType}".`
    );
  }
}

export function assertRequiredPlaceholdersResolved(missing: string[]): void {
  if (missing.length > 0) {
    throw new DocumentGenerationError(
      "VALIDATION_ERROR",
      `Missing required document data: ${missing.join(", ")}`,
      { missingPlaceholders: missing }
    );
  }
}
