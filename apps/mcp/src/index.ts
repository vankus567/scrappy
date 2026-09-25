// Scrappy MCP server: gives any MCP client (Claude Code, Cursor, agents) human judgment as tools.
// Every call pays real humans in USDC on Solana: from a project balance (SCRAPPY_API_KEY) or an agent wallet via x402 (SCRAPPY_AGENT_SECRET).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Scrappy } from "../../../packages/sdk/src/index";

const apiKey = process.env.SCRAPPY_API_KEY ?? process.env.KAGE_API_KEY;
const walletSecretKey = process.env.SCRAPPY_AGENT_SECRET ?? process.env.KAGE_AGENT_SECRET;
if (!apiKey && !walletSecretKey) {
  console.error("Set SCRAPPY_API_KEY (project key) or SCRAPPY_AGENT_SECRET (base58 64-byte agent wallet key).");
  process.exit(1);
}
const scrappy = new Scrappy({ baseUrl: process.env.SCRAPPY_API ?? process.env.KAGE_API ?? "https://kageai.me", apiKey, walletSecretKey });

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
