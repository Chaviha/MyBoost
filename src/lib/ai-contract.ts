import type { JobResourceUsage, QuoteLineItem } from "./types";

/**
 * Provider-neutral payload for AI quotation analysis.
 * AI providers may interpret drawings/photos/text, but they return this contract.
 * LifeBoost then resolves catalogue prices and performs the financial calculation.
 */
export type AIQuotationInput = {
  version: "1";
  job_type: "fabrication" | "installation" | "construction" | "general";
  project: { name: string; notes?: string };
  dimensions: Record<string, number | string>;
  components: Array<{
    component_type: string;
    material: string;
    specification?: string;
    quantity: number;
    dimensions?: Record<string, number | string>;
    finish?: string;
  }>;
  labour?: Array<{ profession: string; hours?: number; days?: number; workers?: number }>;
  transport?: { vehicle?: string; distance_km?: number };
  source?: { text?: string; drawing_name?: string; image_names?: string[] };
};

export type AIQuotationResult = {
  input: AIQuotationInput;
  confidence: number;
  questions: string[];
  suggested_lines: QuoteLineItem[];
};

export function createAIReadyQuotationPayload(args: {
  name: string;
  jobType?: AIQuotationInput["job_type"];
  notes?: string;
  dimensions?: Record<string, number | string>;
  components?: AIQuotationInput["components"];
  labour?: AIQuotationInput["labour"];
  transport?: AIQuotationInput["transport"];
}): AIQuotationInput {
  return {
    version: "1",
    job_type: args.jobType || "fabrication",
    project: { name: args.name, notes: args.notes },
    dimensions: args.dimensions || {},
    components: args.components || [],
    labour: args.labour,
    transport: args.transport,
  };
}

/** Convert accepted quotation lines into the planned resources used by Job tracking. */
export function quoteLinesToPlannedResources(lines: QuoteLineItem[]): JobResourceUsage[] {
  return lines.map((line) => ({
    resource_id: `planned_${line.line_id}`,
    product_id: line.source_product_id,
    description: line.description,
    qty: Number(line.qty || 0),
    unit: line.unit,
    rate: Number(line.rate || 0),
    amount: Number(line.amount || 0),
    source: line.source_product_id ? "catalogue" : "manual",
  }));
}
