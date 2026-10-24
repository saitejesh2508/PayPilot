// The PayPilot agent: Gemini function calling over PayPal invoice data.
// Read tools run immediately. Money-moving tools only create PROPOSALS that a human must approve.
import { getOverview } from "./data";
import { addAction, addAudit, hasPendingForInvoice, daysSinceReminder } from "./store";

const SYSTEM = `You are PayPilot, an accounts-receivable agent for a freelancer or small business that invoices clients through PayPal.
Rules:
- Use tools to get real data. Never invent invoices, amounts, or clients.
- You CANNOT send anything yourself. propose_reminder and propose_invoice only add a proposal to an approval queue; the owner approves or rejects it. Say "I've proposed..." never "I've sent...".
- Choose reminder tone by severity: friendly for 1-7 days overdue or low-risk clients, firm for 8-21 days or medium risk, final for 22+ days or high risk.
- Write the reminder note yourself: short, polite, specific (invoice number, amount, due date), and ask for payment or a reply. No threats.
- Keep answers short and concrete. Lead with the answer. Use plain text, no markdown tables.
- Amounts are in the invoice currency.
- When asked how a client can pay, or for payment links, use get_payment_link. Every reminder you propose automatically includes the invoice's PayPal pay link.
- If propose_reminder says an invoice was reminded recently or already has a pending reminder, skip it and mention that briefly.`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "list_invoices",
        description: "List the user's PayPal invoices with status, client, amount, due date and days overdue. Optionally filter.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter: { type: "STRING", description: "one of: all, open, overdue, paid" },
            client: { type: "STRING", description: "optional client name substring" },
          },
        },
      },
      {
        name: "client_risk",
        description: "Late-payment risk score (0-100) per client based on payment history and current overdue invoices.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "cashflow_forecast",
        description: "Expected cash collected over the next 30 days (risk-weighted) versus if every client paid on time.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_payment_link",
        description: "Get the PayPal payment link a client can use to pay an unpaid invoice.",
        parameters: {
          type: "OBJECT",
          properties: { invoice_number: { type: "STRING", description: "the invoice number, e.g. 0007" } },
          required: ["invoice_number"],
        },
      },
      {
        name: "propose_reminder",
        description: "Propose sending a PayPal payment reminder for an unpaid invoice. Goes to the approval queue.",
        parameters: {
          type: "OBJECT",
          properties: {
            invoice_number: { type: "STRING", description: "the invoice number, e.g. 0007" },
            tone: { type: "STRING", description: "friendly, firm, or final" },
            note: { type: "STRING", description: "the message to the client" },
            reasoning: { type: "STRING", description: "one sentence on why this tone and why now" },
          },
          required: ["invoice_number", "tone", "note", "reasoning"],
        },
      },
      {
        name: "propose_invoice",
        description: "Propose creating and sending a new PayPal invoice. Goes to the approval queue.",
        parameters: {
          type: "OBJECT",
          properties: {
            client_name: { type: "STRING" },
            client_email: { type: "STRING" },
            description: { type: "STRING", description: "what the invoice is for" },
            amount: { type: "NUMBER" },
            currency: { type: "STRING", description: "ISO code, default USD" },
            due_in_days: { type: "INTEGER", description: "days until due, default 14" },
            reasoning: { type: "STRING" },
          },
          required: ["client_name", "client_email", "description", "amount", "reasoning"],
        },
      },
    ],
  },
];

const fmt = (n: number, c = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);

async function runTool(name: string, args: any, source: "chat" | "morning"): Promise<any> {
  const ov = await getOverview();
  if (name === "list_invoices") {
    let list = ov.invoices as any[];
    const f = String(args.filter || "all");
    if (f === "open") list = list.filter((i) => i.open);
    if (f === "overdue") list = list.filter((i) => i.daysOverdue > 0);
    if (f === "paid") list = list.filter((i) => i.paid);
    if (args.client) list = list.filter((i) => i.client.toLowerCase().includes(String(args.client).toLowerCase()));
    return list.slice(0, 40).map((i) => ({
      number: i.number, client: i.client, status: i.status, amount: i.amount, amountDue: i.due,
      currency: i.currency, dueDate: i.dueDate, daysOverdue: i.daysOverdue, paidDate: i.paidDate, daysLate: i.daysLate,
    }));
  }
  if (name === "client_risk") return ov.risk;
  if (name === "cashflow_forecast") {
    const f = ov.forecast as any[];
    const pick = [0, 7, 14, 21, 30].map((d) => f[d]).filter(Boolean);
    return { points: pick, expectedIn30Days: ov.kpis.expected30, outstanding: ov.kpis.outstanding, overdue: ov.kpis.overdue };
  }
  if (name === "get_payment_link") {
    const inv = (ov.invoices as any[]).find((i) => String(i.number) === String(args.invoice_number) || i.id === args.invoice_number);
    if (!inv) return { error: `No invoice with number ${args.invoice_number}` };
    if (!inv.open) return { error: `Invoice ${inv.number} is not unpaid (status ${inv.status})` };
    return { invoice: inv.number, client: inv.client, amountDue: inv.due, currency: inv.currency, payUrl: inv.payUrl };
  }
  if (name === "propose_reminder") {
    const inv = (ov.invoices as any[]).find((i) => String(i.number) === String(args.invoice_number) || i.id === args.invoice_number);
    if (!inv) return { error: `No invoice with number ${args.invoice_number}` };
    if (!inv.open) return { error: `Invoice ${inv.number} is not unpaid (status ${inv.status})` };
    if (hasPendingForInvoice(inv.id)) return { error: `A reminder for invoice ${inv.number} is already waiting for approval` };
    const since = daysSinceReminder(inv.id);
    if (since !== null && since < 3) return { error: `Invoice ${inv.number} was already reminded ${since} day(s) ago. Skip it for now.` };
    const tone = ["friendly", "firm", "final"].includes(args.tone) ? args.tone : "friendly";
    const subject =
      tone === "final" ? `Final notice: invoice ${inv.number}` : tone === "firm" ? `Payment overdue: invoice ${inv.number}` : `Friendly reminder: invoice ${inv.number}`;
    const a = addAction({
      type: "send_reminder",
      source,
      summary: `Send ${tone} reminder to ${inv.client} for invoice ${inv.number} (${fmt(inv.due, inv.currency)}, ${inv.daysOverdue} days overdue)`,
      reasoning: String(args.reasoning || ""),
      params: {
        invoiceId: inv.id, number: inv.number, client: inv.client, tone, subject,
        note: String(args.note || "").slice(0, 800) + (inv.payUrl ? `\n\nPay securely online: ${inv.payUrl}` : ""),
        payUrl: inv.payUrl,
      },
    });
    return { proposed: true, actionId: a.id, awaiting: "owner approval" };
  }
  if (name === "propose_invoice") {
    const amount = Number(args.amount);
    if (!(amount > 0)) return { error: "amount must be positive" };
    const currency = String(args.currency || "USD").toUpperCase();
    const a = addAction({
      type: "create_invoice",
      source,
      summary: `Create and send invoice to ${args.client_name} for ${fmt(amount, currency)}: ${args.description}`,
      reasoning: String(args.reasoning || ""),
      params: {
        clientName: String(args.client_name), clientEmail: String(args.client_email), description: String(args.description),
        amount, currency, dueInDays: Number(args.due_in_days || 14),
      },
    });
    return { proposed: true, actionId: a.id, awaiting: "owner approval" };
  }
  return { error: `Unknown tool ${name}` };
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Calls Gemini with retries on temporary errors (429/500/503/504) and falls back to other models.
async function callGemini(key: string, body: any): Promise<any> {
  const models = [
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash-lite,gemini-2.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean),
  ];
  const errors: string[] = [];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (let attempt = 0; attempt < 3; attempt++) {
      console.log(`[agent] calling ${model} (attempt ${attempt + 1})`);
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });
      } catch (e: any) {
        const msg = `${model} -> no response within 30s (${String(e?.name || e)})`;
        console.log(`[agent] ${msg}`);
        if (!errors.includes(msg)) errors.push(msg);
        continue; // retry, then fall back to the next model
      }
      const data: any = await res.json().catch(() => ({}));
      console.log(`[agent] ${model} answered ${res.status} in ${Date.now() - t0}ms`);
      if (res.ok) return data;
      const msg = `${model} -> ${res.status}: ${String(data?.error?.message || JSON.stringify(data)).slice(0, 140)}`;
      if (!errors.includes(msg)) errors.push(msg);
      if (res.status === 404 || res.status === 400) break; // model unavailable or bad request: try next model
      if ([429, 500, 503, 504].includes(res.status)) {
        await sleep(1500 * (attempt + 1)); // 1.5s, 3s, 4.5s
        continue;
      }
      throw new Error("Gemini error: " + msg); // auth errors etc: do not retry
    }
  }
  throw new Error("All Gemini models failed:\n" + (errors.join("\n") || "no response"));
}

export type ChatMsg = { role: "user" | "assistant"; text: string };

export async function runAgent(history: ChatMsg[], source: "chat" | "morning" = "chat") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing. Add it to .env.local");
  const contents: any[] = history.slice(-12).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
  while (contents.length && contents[0].role !== "user") contents.shift();
  const steps: string[] = [];

  for (let turn = 0; turn < 8; turn++) {
    const data: any = await callGemini(key, { systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools: TOOLS });
    const content = data?.candidates?.[0]?.content;
    const parts: any[] = content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = parts.map((p) => p.text || "").join("").trim();
      return { reply: text || "I couldn't produce an answer. Try rephrasing.", steps };
    }
    contents.push(content);
    const responses: any[] = [];
    for (const p of calls) {
      const { name, args } = p.functionCall;
      steps.push(name);
      console.log(`[agent] tool: ${name}`);
      let result: any;
      try {
        result = await runTool(name, args || {}, source);
      } catch (e: any) {
        result = { error: String(e?.message || e) };
      }
      if (name.startsWith("propose") && result?.proposed) addAudit("agent", `${name} → proposal created`);
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "I hit my step limit. Check the approval queue for what I proposed so far.", steps };
}

export const MORNING_PROMPT = `Run the morning review. 1) Check overdue invoices and client risk. 2) For each overdue invoice (most urgent first, at most 8), propose a reminder with the right tone and a specific note. Skip invoices that already have a pending reminder. 3) Finish with a 3-4 sentence briefing: how much is overdue, which client is the biggest worry, and the 30-day cash outlook.`;
