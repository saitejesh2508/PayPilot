// Thin PayPal REST client (Invoicing v2, sandbox by default).
const BASE = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
let cached: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PayPal credentials missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local");
  }
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${JSON.stringify(data)}`);
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

export async function pp(path: string, method = "GET", body?: unknown): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`PayPal ${method} ${path} failed (${res.status}): ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

export async function listRawInvoices(): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await pp(`/v2/invoicing/invoices?page=${page}&page_size=50&total_required=true`);
    const items = r.items || [];
    all.push(...items);
    if (items.length < 50) break;
  }
  return all;
}

export async function fetchInvoiceDetails(): Promise<any[]> {
  const list = await listRawInvoices();
  return mapLimit(list, 6, (i) => pp(`/v2/invoicing/invoices/${i.id}`).catch(() => i));
}

export async function sendReminder(invoiceId: string, subject: string, note: string) {
  return pp(`/v2/invoicing/invoices/${invoiceId}/remind`, "POST", {
    subject,
    note,
    send_to_invoicer: false,
  });
}

export async function createAndSendInvoice(p: {
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  currency: string;
  dueInDays: number;
}) {
  const today = new Date();
  const due = new Date(today.getTime() + p.dueInDays * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const next = await pp("/v2/invoicing/generate-next-invoice-number", "POST");
  const body: any = {
    detail: {
      invoice_number: next.invoice_number,
      invoice_date: iso(today),
      currency_code: p.currency,
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: iso(due) },
    },
    primary_recipients: [
      { billing_info: { name: { business_name: p.clientName }, email_address: p.clientEmail } },
    ],
    items: [
      {
        name: p.description,
        quantity: "1",
        unit_amount: { currency_code: p.currency, value: p.amount.toFixed(2) },
      },
    ],
  };
  if (process.env.PAYPAL_BUSINESS_EMAIL) body.invoicer = { email_address: process.env.PAYPAL_BUSINESS_EMAIL };
  const created = await pp("/v2/invoicing/invoices", "POST", body);
  const id = String(created.href || "").split("/").pop();
  if (!id) throw new Error("PayPal did not return an invoice id");
  await pp(`/v2/invoicing/invoices/${id}/send`, "POST", { send_to_recipient: true, send_to_invoicer: false });
  return { id, number: next.invoice_number };
}
