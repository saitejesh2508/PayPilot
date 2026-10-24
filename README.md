# PayPilot

**An AI accounts-receivable agent for freelancers and small businesses that get paid through PayPal.**

Late payments are one of the biggest cash-flow problems for small businesses. PayPilot watches your PayPal invoices, scores how risky each client is, forecasts the next 30 days of cash, and proposes the right reminder for every overdue invoice. **You approve every action that moves money** before it reaches PayPal.

Built for the PayPal AI Hackathon on Devpost.

## What it does

- **AI agent with tools.** Ask in plain language ("who owes me money?", "draft a $1,500 invoice for Northwind"). The agent calls tools that read live PayPal invoice data.
- **Approval queue (human in the loop).** The agent can only *propose* reminders and new invoices. Each proposal shows the exact message and the reasoning. Nothing is sent until you click Approve.
- **Morning review.** One click: the agent reviews every overdue invoice, picks a tone (friendly, firm, final) based on days overdue and client risk, writes the message, and queues it.
- **Client risk scoring.** Computed from each client's real payment history (average days late, share of late payments, current overdue invoices).
- **30-day cash forecast.** Expected collections weighted by client risk, compared against "everyone pays on time".
- **AG Grid invoice table.** Sort, filter and search every invoice.
- **Audit log.** Every proposal, approval, rejection and failure is recorded.

## How PayPal and AI are used

| Part | What it does |
|---|---|
| PayPal Invoicing API v2 (sandbox) | List and read invoices, create and send invoices, send payment reminders |
| Google Gemini (function calling) | The agent that reads data, reasons about risk and writes proposals |
| AG Grid Community | Invoice table |

The agent never calls a money-moving PayPal endpoint directly. Approving a proposal in the UI is the only path to `send reminder` and `create and send invoice`.

## Run it locally

Requirements: Node.js 20.6 or newer, a free [PayPal developer](https://developer.paypal.com) account, and a free [Gemini API key](https://aistudio.google.com/apikey).

1. Create a **sandbox app** in the PayPal Developer Dashboard and copy its Client ID and Secret.
2. Install and configure:
   ```bash
   npm install
   cp .env.example .env.local
   # edit .env.local with your PayPal and Gemini keys
   ```
3. Seed the sandbox with demo invoices (run this **once**):
   ```bash
   npm run seed
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000, then click **Run morning review**.

## Deploy on Render

The repo includes `render.yaml`. Create a new Blueprint on Render from this repo and set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `GEMINI_API_KEY`. The approval queue is stored in a JSON file, so on Render's free tier it resets when the service restarts. That is fine for a demo.

## Project layout

```
app/            Next.js UI and API routes (/api/state, /api/chat, /api/morning, /api/actions/[id])
lib/paypal.ts   PayPal REST client
lib/agent.ts    Gemini agent, tools and approval-gated proposals
lib/analytics.ts  Risk scoring and cash forecast
lib/execute.ts  Runs an approved action against PayPal
scripts/seed.mjs  Creates demo invoices in the sandbox
```

## Safety notes

- Sandbox only by default. Do not point it at live credentials.
- The hosted demo has no login. Use a throwaway sandbox app for it.

## License

MIT
