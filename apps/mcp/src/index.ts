// Scrappy MCP server: gives any MCP client (Claude Code, Cursor, agents) human judgment as tools.
// Every call pays real humans in USDC on Solana: from a project balance (SCRAPPY_API_KEY) or an agent wallet via x402 (SCRAPPY_AGENT_SECRET).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Scrappy } from "../../../packages/sdk/src/index";

const apiKey = process.env.SCRAPPY_API_KEY;
const walletSecretKey = process.env.SCRAPPY_AGENT_SECRET;
if (!apiKey && !walletSecretKey) {
  console.error("Set SCRAPPY_API_KEY (project key) or SCRAPPY_AGENT_SECRET (base58 64-byte agent wallet key).");
  process.exit(1);
}
const scrappy = new Scrappy({ baseUrl: process.env.SCRAPPY_API ?? "https://scrappypet.vercel.app", apiKey, walletSecretKey });

const server = new McpServer({ name: "scrappy", version: "0.2.0" });

const taskFields = {
  task: z.string().describe("What the humans should decide, as a question"),
  content: z.string().optional().describe("Material to judge: a reply, a translation, a code diff"),
  options: z.array(z.string()).optional().describe("Choices; omit for a yes/no question"),
  response_schema: z
    .object({ type: z.enum(["binary", "choice", "rating", "text"]), options: z.array(z.string()).optional(), scale: z.number().optional() })
    .optional()
    .describe("Answer shape; default yes/no, or choice when options are given"),
  language: z.string().optional().describe("ISO language code, default en"),
  skill: z.string().optional().describe("Routing skill, e.g. translation, security, support"),
  budget: z.number().optional().describe("Total USDC for this round; default $0.05 per human"),
  deadline: z.number().optional().describe("Seconds you can wait (10-600), default 60"),
};

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
const fail = (err: unknown) => ({ isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] });
const summary = (r: Awaited<ReturnType<Scrappy["consensus"]>>) => ({
  status: r.status, answer: r.answer, agreement: r.agreement, confidence: r.confidence, humans: r.humans, votes: r.votes,
  latency_ms: r.latency_ms, spent_usdc: r.spent_usdc, task_id: r.task_id,
  ...(r.status === "insufficient_capacity" && { reason: r.reason, available: r.available, required: r.required }),
});

server.registerTool(
  "scrappy_ask_human",
  {
    title: "Ask a human",
    description:
      "Pay one real human (USDC on Solana) for a quick judgment when you are unsure: is this correct, is this safe, does this " +
      "sound natural in a language. Returns the answer and the human's confidence, or status insufficient_capacity if nobody qualified is online.",
    inputSchema: taskFields,
  },
  async (a) => {
    try {
      return text(summary(await scrappy.askHuman({ ...a, responseSchema: a.response_schema as never })));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "scrappy_consensus",
  {
    title: "Get human consensus",
    description:
      "Ask several independent humans the same question and get the majority answer with agreement (0-1). Use before " +
      "irreversible actions (deploying, sending, refunding). If agreement is below quality_threshold, Scrappy can add more humans up to max_humans.",
    inputSchema: {
      ...taskFields,
      humans: z.number().int().min(1).max(15).optional().describe("Independent humans, default 3"),
      quality_threshold: z.number().optional().describe("Agreement you need, default 0.8"),
      max_humans: z.number().int().optional().describe("Escalate up to this many humans in total when agreement is low"),
      max_budget: z.number().optional().describe("Hard cap on total USDC across rounds"),
    },
  },
  async (a) => {
    try {
      return text(summary(await scrappy.consensus({
        ...a, responseSchema: a.response_schema as never, qualityThreshold: a.quality_threshold, maxHumans: a.max_humans, maxBudget: a.max_budget,
      })));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "scrappy_find_human",
  {
    title: "Send a human to a place",
    description:
      "Eyes and hands in the physical world. A nearby human goes to a place (a shop shelf, a restaurant, an entrance), checks what " +
      "you ask, and answers with a photo and a GPS fix. Scrappy verifies the photo and that they were within radius_m before paying " +
      "them in USDC. Returns the answer, verified (true/false) and the evidence (photo_url, sha256, distance_m, captured_at).",
    inputSchema: {
      task: z.string().describe("What to check on site, e.g. 'Is Amul butter 500g on the shelf? Reply with the shelf price.'"),
      place: z.object({
        lat: z.number(), lng: z.number(),
        radius_m: z.number().optional().describe("How close they must be, default 250"),
        name: z.string().optional().describe("Shown to the human, e.g. 'Reliance Smart, Mangalagiri'"),
      }),
      kind: z.enum(["photo_check", "price_check", "visit"]).optional().describe("Default photo_check"),
      response_schema: taskFields.response_schema,
      options: taskFields.options,
      proof: z.object({ photo: z.boolean().optional(), gps: z.boolean().optional() }).optional().describe("Default: photo + GPS"),
      budget: z.number().optional().describe("USDC for the human, e.g. 0.5"),
      deadline: z.number().optional().describe("Seconds you can wait (up to 3600), default 1800"),
      agent: z.object({ name: z.string(), reason: z.string().optional() }).optional().describe("Who is asking and why you are stuck"),
    },
  },
  async (a) => {
    try {
      const r = await scrappy.findHuman({ ...a, responseSchema: a.response_schema as never });
      return text({ ...summary(r), verified: r.verified ?? false, proof: r.proof ?? [] });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "scrappy_find_capacity",
  {
    title: "Find human capacity",
    description: "Free. How many qualified humans are online right now for a language and skill. Check before asking many humans.",
    inputSchema: { language: z.string().optional(), skill: z.string().optional(), min_accuracy: z.number().optional() },
  },
  async (a) => {
    try {
      return text(await scrappy.findCapacity({ language: a.language, skill: a.skill, minAccuracy: a.min_accuracy }));
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error("Scrappy MCP ready.");
