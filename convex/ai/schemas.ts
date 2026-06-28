import { z } from "zod";

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

const lowMedHigh = z.enum(["low", "medium", "high"]).catch("medium");

const stage1Raw = z.object({
  isProblem: z.boolean(),
  problemStatement: z.string(),
  who: z.string(),
  industry: z.string(),
  severity: z.number(),
  urgency: z.number(),
  recurring: z.boolean(),
  workaround: z.string().optional(),
  desiredSolution: z.string().optional(),
  confidence: z.number(),
});

const stage2Raw = z.object({
  opportunityScore: z.number(),
  willingnessToPay: lowMedHigh,
  marketSizeEstimate: z.string(),
  frequency: lowMedHigh,
  viability: z.number(),
  complexity: z.number(),
});

export type Stage1 = {
  isProblem: boolean;
  confidence: number;
  // Fields matching the `stage1Problem` Convex validator:
  problem: {
    problemStatement: string;
    who: string;
    industry: string;
    severity: number;
    urgency: number;
    recurring: boolean;
    workaround?: string;
    desiredSolution?: string;
  };
};

export type Stage2 = {
  opportunityScore: number;
  willingnessToPay: "low" | "medium" | "high";
  marketSizeEstimate: string;
  frequency: "low" | "medium" | "high";
  viability: number;
  complexity: number;
};

/** Validate + clamp Stage 1 output. Throws if the shape is unrecoverable. */
export function coerceStage1(data: unknown): Stage1 {
  const r = stage1Raw.parse(data);
  return {
    isProblem: r.isProblem,
    confidence: clamp(r.confidence, 0, 1),
    problem: {
      problemStatement: r.problemStatement,
      who: r.who,
      industry: r.industry,
      severity: clamp(Math.round(r.severity), 1, 5),
      urgency: clamp(Math.round(r.urgency), 1, 5),
      recurring: r.recurring,
      workaround: r.workaround || undefined,
      desiredSolution: r.desiredSolution || undefined,
    },
  };
}

/** Validate + clamp Stage 2 output. */
export function coerceStage2(data: unknown): Stage2 {
  const r = stage2Raw.parse(data);
  return {
    opportunityScore: clamp(Math.round(r.opportunityScore), 0, 100),
    willingnessToPay: r.willingnessToPay,
    marketSizeEstimate: r.marketSizeEstimate,
    frequency: r.frequency,
    viability: clamp(Math.round(r.viability), 0, 100),
    complexity: clamp(Math.round(r.complexity), 1, 5),
  };
}
