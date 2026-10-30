// Chirp Chore Chart: MCP server for ChatGPT (Apps SDK / MCP Apps).
// Stateless streamable-HTTP JSON-RPC. Stores nothing, no auth, no external calls.
// Collects no personal information: kids are shown by an optional label the parent chooses.
import { WIDGET_HTML, WIDGET_URI } from "./widget.ts";

const SERVER_INFO = { name: "chirp-chore-chart", title: "Chirp Chore Chart", version: "1.0.2" };
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS =
  "Use render_chore_chart when a parent wants a chore chart, a routine chart (morning, bedtime, after school), or a plan for kids to earn screen time or rewards by doing chores. " +
  "Pick suitable chores yourself (usually 3 to 6 per kid), give each a reward in minutes (5 to 30 is typical), and a schedule. " +
  "Do not ask for names, ages, or any other personal details. Label each kid 'Kid 1', 'Kid 2', and so on, unless the parent has already chosen a label. " +
  "After rendering, briefly say the parent can check off days and tap a chore to edit it.";

const SCHEDULES = ["daily", "weekdays", "weekends", "weekly", "none"];

const choreSchema = {
  type: "object",
  properties: {
    name: { type: "string", maxLength: 100, description: "Short chore name, e.g. 'Make bed'" },
    emoji: { type: "string", maxLength: 8, description: "One emoji for the chore" },
    minutes: { type: "integer", minimum: 1, maximum: 480, description: "Reward minutes earned each time it's done" },
    schedule: { type: "string", enum: SCHEDULES, description: "How often: daily, weekdays, weekends, weekly, or none (anytime)" },
    day: { type: "integer", minimum: 1, maximum: 7, description: "For weekly chores only: 1=Mon ... 7=Sun" },
  },
  required: ["name", "minutes", "schedule"],
  additionalProperties: false,
};

const chartSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 60, description: "Chart title, e.g. 'Morning Routine'" },
    kids: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          label: { type: "string", maxLength: 30, description: "Optional tab label, e.g. 'Kid 1'. Never ask the parent for one." },
          emoji: { type: "string", maxLength: 8 },
          chores: { type: "array", maxItems: 15, items: choreSchema },
        },
        required: ["chores"],
        additionalProperties: false,
      },
    },
  },
  required: ["kids"],
  additionalProperties: false,
};

const TOOLS = [
  {
    name: "render_chore_chart",
    title: "Show chore chart",
    description:
      "Shows an interactive weekly chore or routine chart for one or more kids. Each chore has a reward in minutes and a schedule. " +
      "Parents can check off days and edit chores in the chart. Provide the full chart each time. No personal information is needed.",
    inputSchema: chartSchema,
    outputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kids: { type: "array" },
        summary: { type: "array" },
      },
      required: ["kids"],
    },
    annotations: { title: "Show chore chart", readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      "openai/outputTemplate": WIDGET_URI,
      "openai/toolInvocation/invoking": "Building the chart",
      "openai/toolInvocation/invoked": "Chart ready",
    },
  },
];

const RESOURCE_META = {
  ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
  "openai/widgetDescription": "An interactive weekly chore chart with check-offs, editing, and minutes earned per kid.",
  "openai/widgetPrefersBorder": true,
  "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
};

// ---------- validation ----------
type Chore = { name: string; emoji?: string; minutes: number; schedule: string; day?: number };
type Kid = { label: string; emoji?: string; chores: Chore[] };

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function validate(args: any): { ok: true; title: string; kids: Kid[] } | { ok: false; error: string } {
  if (!args || typeof args !== "object") return { ok: false, error: "Arguments must be an object." };
  if (!Array.isArray(args.kids) || args.kids.length === 0) return { ok: false, error: "Include at least one kid in 'kids'." };
  if (args.kids.length > 8) return { ok: false, error: "Up to 8 kids per chart." };
  const kids: Kid[] = [];
  args.kids.forEach((k: any, i: number) => {
    const label = clean(k?.label ?? k?.name, 30) || `Kid ${i + 1}`;
    const chores: Chore[] = [];
    for (const c of (Array.isArray(k?.chores) ? k.chores : []).slice(0, 15)) {
      const cname = clean(c?.name, 100);
      if (!cname) continue;
      let minutes = Math.round(Number(c?.minutes));
      if (!Number.isFinite(minutes) || minutes < 1) minutes = 15;
      minutes = Math.min(480, minutes);
      const schedule = SCHEDULES.includes(c?.schedule) ? c.schedule : "daily";
      const chore: Chore = { name: cname, emoji: clean(c?.emoji, 8) || undefined, minutes, schedule };
      if (schedule === "weekly") {
        const d = Math.round(Number(c?.day));
        chore.day = d >= 1 && d <= 7 ? d : 6;
      }
      chores.push(chore);
    }
    kids.push({ label, emoji: clean(k?.emoji, 8) || undefined, chores });
  });
  return { ok: true, title: clean(args.title, 60) || "Family Chore Chart", kids };
}

const PER_WEEK: Record<string, number> = { daily: 7, weekdays: 5, weekends: 2, weekly: 1, none: 1 };

function renderChart(args: any) {
  const v = validate(args);
  if (!v.ok) {
    return { isError: true, content: [{ type: "text", text: v.error }] };
  }
  const summary = v.kids.map((k) => ({
    label: k.label,
    chores: k.chores.length,
    max_minutes_per_week: k.chores.reduce((t, c) => t + c.minutes * PER_WEEK[c.schedule], 0),
  }));
  const text = summary
    .map((s) => `${s.label}: ${s.chores} chore${s.chores === 1 ? "" : "s"}, up to ${s.max_minutes_per_week} min/week`)
    .join("; ");
  return {
    structuredContent: { title: v.title, kids: v.kids, summary },
    content: [{ type: "text", text: `Chore chart "${v.title}" shown. ${text}. Parent can check off days and edit chores in the chart.` }],
  };
}

// ---------- JSON-RPC ----------
function ok(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function err(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }

function handle(msg: any): object | null {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(msg?.id, -32600, "Invalid Request");
  const isNotification = msg.id === undefined || msg.id === null;
  const p = msg.params ?? {};
  switch (msg.method) {
    case "initialize": {
      const requested = p.protocolVersion;
      const protocolVersion = SUPPORTED.includes(requested) ? requested : SUPPORTED[0];
      return ok(msg.id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          extensions: { "io.modelcontextprotocol/ui": {} },
        },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping": return isNotification ? null : ok(msg.id, {});
    case "tools/list": return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      if (p.name !== "render_chore_chart") return err(msg.id, -32602, `Unknown tool: ${p.name}`);
      return ok(msg.id, renderChart(p.arguments));
    }
    case "resources/list":
      return ok(msg.id, {
        resources: [{ uri: WIDGET_URI, name: "chore-chart", title: "Chore chart", mimeType: "text/html;profile=mcp-app", _meta: RESOURCE_META }],
      });
    case "resources/templates/list": return ok(msg.id, { resourceTemplates: [] });
    case "resources/read":
      if (p.uri !== WIDGET_URI) return err(msg.id, -32002, "Resource not found");
      return ok(msg.id, { contents: [{ uri: WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: WIDGET_HTML, _meta: RESOURCE_META }] });
    case "prompts/list": return ok(msg.id, { prompts: [] });
    default:
      if (isNotification) return null; // notifications/initialized etc.
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

export async function serve(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET" || req.method === "DELETE") {
    // Stateless server: no SSE stream, no sessions.
    return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: any;
  try { body = await req.json(); } catch {
    return Response.json(err(null, -32700, "Parse error"), { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const out = (batch ? body : [body]).map((m: any) => {
    try { return handle(m); } catch (e) {
      console.error("handler error", m?.method, (e as Error)?.message);
      return err(m?.id, -32603, "Internal error");
    }
  }).filter((r: unknown) => r !== null);

  if (out.length === 0) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? out : out[0], { headers: CORS });
}

if (typeof Deno !== "undefined" && (Deno as any).serve) {
  Deno.serve(serve);
}
