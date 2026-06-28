import { generateStructured, GeminiSchema } from "./gemini";

/** Slightly stronger/creative model for generation; override via GEMINI_GEN_MODEL. */
function genModel(): string {
  return process.env.GEMINI_GEN_MODEL ?? "gemini-2.5-flash";
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

export type ClusterContext = {
  industry?: string;
  problemSummary: string;
  painPoints: string[];
  mentionCount: number;
};

// ---------------------------------------------------------------------------
// Stages 3 + 4 — Competitor Analysis + Generated SaaS Idea
// ---------------------------------------------------------------------------

const BUSINESS_SYSTEM =
  "You are a SaaS product strategist. Given a recurring problem found across " +
  "multiple Reddit discussions, assess the competitive landscape and design a " +
  "concrete SaaS product to solve it. Output ONLY JSON matching the schema. " +
  "marketScore is an integer 0..100.";

const businessSchema: GeminiSchema = {
  type: "object",
  properties: {
    competition: {
      type: "object",
      properties: {
        existingProducts: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, note: { type: "string" } },
            required: ["name"],
          },
        },
        saturated: { type: "boolean" },
        underserved: { type: "boolean" },
        gaps: { type: "array", items: { type: "string" } },
      },
      required: ["existingProducts", "saturated", "underserved", "gaps"],
    },
    saas: {
      type: "object",
      properties: {
        name: { type: "string" },
        summary: { type: "string" },
        icp: { type: "string" },
        features: { type: "array", items: { type: "string" } },
        pricing: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tier: { type: "string" },
              price: { type: "string" },
              features: { type: "array", items: { type: "string" } },
            },
            required: ["tier", "price", "features"],
          },
        },
        mvpScope: { type: "array", items: { type: "string" } },
        monetization: { type: "string" },
        advantage: { type: "string" },
      },
      required: [
        "name",
        "summary",
        "icp",
        "features",
        "pricing",
        "mvpScope",
        "monetization",
        "advantage",
      ],
    },
    marketScore: { type: "integer" },
  },
  required: ["competition", "saas", "marketScore"],
};

export async function generateBusiness(cx: ClusterContext) {
  const prompt =
    `Problem (industry: ${cx.industry ?? "unknown"}, seen in ${cx.mentionCount} ` +
    `discussion(s)):\n${cx.problemSummary}\n\nPain points:\n` +
    cx.painPoints.map((p) => `- ${p}`).join("\n") +
    `\n\nAnalyze existing competitors and gaps, then design a focused SaaS to solve this.`;

  const res = await generateStructured({
    system: BUSINESS_SYSTEM,
    prompt,
    schema: businessSchema,
    model: genModel(),
    temperature: 0.6,
  });
  const d = res.data as any;
  return {
    competition: d.competition,
    saas: d.saas,
    marketScore: clamp(Math.round(d.marketScore), 0, 100),
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
  };
}

// ---------------------------------------------------------------------------
// Stages 5 + 6 — Technical Specification + Development Plan
// ---------------------------------------------------------------------------

const TECH_SYSTEM =
  "You are a senior software architect. Given a SaaS product idea, produce a " +
  "concrete technical specification and a phased build plan. Output ONLY JSON " +
  "matching the schema. difficulty is one of low/medium/high.";

const techSchema: GeminiSchema = {
  type: "object",
  properties: {
    techSpec: {
      type: "object",
      properties: {
        features: { type: "array", items: { type: "string" } },
        roles: { type: "array", items: { type: "string" } },
        pages: { type: "array", items: { type: "string" } },
        navigation: { type: "array", items: { type: "string" } },
        apiEndpoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              method: { type: "string" },
              path: { type: "string" },
              purpose: { type: "string" },
            },
            required: ["method", "path", "purpose"],
          },
        },
        dbSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              table: { type: "string" },
              fields: { type: "array", items: { type: "string" } },
            },
            required: ["table", "fields"],
          },
        },
        jobs: { type: "array", items: { type: "string" } },
        auth: { type: "string" },
        integrations: { type: "array", items: { type: "string" } },
        architecture: { type: "string" },
        libraries: { type: "array", items: { type: "string" } },
      },
      required: [
        "features",
        "roles",
        "pages",
        "navigation",
        "apiEndpoints",
        "dbSchema",
        "jobs",
        "auth",
        "integrations",
        "architecture",
        "libraries",
      ],
    },
    buildPlan: {
      type: "object",
      properties: {
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
            },
            required: ["title"],
          },
        },
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              goal: { type: "string" },
            },
            required: ["name", "goal"],
          },
        },
        estimatedBuildTime: { type: "string" },
        difficulty: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["milestones", "phases", "estimatedBuildTime", "difficulty"],
    },
  },
  required: ["techSpec", "buildPlan"],
};

export async function generateTechnical(saas: {
  name: string;
  summary: string;
  features: string[];
}) {
  const prompt =
    `SaaS: ${saas.name}\n${saas.summary}\n\nKey features:\n` +
    saas.features.map((f) => `- ${f}`).join("\n") +
    `\n\nProduce the technical spec and phased build plan.`;

  const res = await generateStructured({
    system: TECH_SYSTEM,
    prompt,
    schema: techSchema,
    model: genModel(),
    temperature: 0.4,
  });
  const d = res.data as any;
  return {
    techSpec: d.techSpec,
    buildPlan: d.buildPlan,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
  };
}
