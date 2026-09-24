// Scrappy MCP server: gives any MCP client (Claude Code, Cursor, agents) an `ask_human` tool.
// Each call pays a real human through the Human API (x402, USDC on Solana) from the agent wallet.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHuman } from "../../../packages/sdk/src/index";

const secretKey = process.env.SCRAPPY_AGENT_SECRET;
if (!secretKey) {
  console.error("SCRAPPY_AGENT_SECRET (base58 64-byte agent wallet key) is required.");
  process.exit(1);
}
const human = await createHuman({ apiUrl: process.env.SCRAPPY_API ?? "http://localhost:8787", secretKey });

const server = new McpServer({ name: "scrappy", version: "0.1.0" });

server.registerTool(
  "ask_human",
  {
    title: "Ask a human",
    description:
      "Pay a real human (USDC on Solana) for a quick judgment when you are unsure: fact checks, which answer is right, " +
      "whether text in a language sounds natural. Returns the answer and the human's confidence. Applies a confidence policy: " +
      "a second human below 90%, an expert below 70% or on disagreement.",
    inputSchema: {
      task: z.string().describe("What the human should decide"),
      content: z.string().optional().describe("Text to judge"),
      options: z.array(z.string()).optional().describe("Choices, if any"),
      language: z.string().optional().describe("ISO code, default en"),
      domain: z.string().optional().describe("e.g. crypto, math, support"),
      deadline: z.number().optional().describe("Seconds you can wait, default 60"),
    },
  },
  async (args) => {
    try {
      const r = await human.askWithPolicy(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ answer: r.answer, confidence: Number(r.confidence.toFixed(3)), decision: r.decision, humans: r.trail.length }, null, 2),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] };
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`Scrappy MCP ready. Agent wallet ${human.address}`);
