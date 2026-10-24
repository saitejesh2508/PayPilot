// Seeds your PayPal SANDBOX with realistic invoice history so the demo has data.
// Usage: npm run seed
// Run it ONCE. Running again creates duplicates.
const BASE = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) {
  console.error("Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local");
  process.exit(1);
}

let token = "";
async function auth() {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Auth failed: " + JSON.stringify(data));
  token = data.access_token;
}
async function call(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// issuedAgo = days since invoice date, term = payment term in days, paidLate = days after due date it was paid (null = still open)
const clients = [
  { name: "Northwind Studio", email: "billing@northwind-studio.example.com", invoices: [
    { item: "Brand identity refresh", amount: 1200, issuedAgo: 100, term: 15, paidLate: -1 },
    { item: "Social media kit", amount: 950, issuedAgo: 70, term: 15, paidLate: 0 },
    { item: "Landing page design", amount: 1400, issuedAgo: 40, term: 15, paidLate: -2 },
    { item: "Q4 campaign assets", amount: 1800, issuedAgo: 5, term: 15, paidLate: null },
  ]},
  { name: "Bluebird Co", email: "accounts@bluebird-co.example.com", invoices: [
    { item: "Monthly retainer", amount: 800, issuedAgo: 110, term: 14, paidLate: 8 },
    { item: "Monthly retainer", amount: 1100, issuedAgo: 80, term: 14, paidLate: 10 },
    { item: "Monthly retainer", amount: 900, issuedAgo: 50, term: 14, paidLate: 9 },
    { item: "Monthly retainer", amount: 1250, issuedAgo: 30, term: 14, paidLate: null },
  ]},
  { name: "Kestrel Labs", email: "finance@kestrel-labs.example.com", invoices: [
    { item: "Data pipeline build", amount: 2400, issuedAgo: 120, term: 30, paidLate: 22 },
    { item: "Dashboard development", amount: 3100, issuedAgo: 85, term: 30, paidLate: 28 },
    { item: "Analytics consulting", amount: 2750, issuedAgo: 60, term: 30, paidLate: null },
    { item: "Reporting automation", amount: 1500, issuedAgo: 20, term: 30, paidLate: null },
  ]},
  { name: "Orchid Foods", email: "ap@orchid-foods.example.com", invoices: [
    { item: "Menu photography", amount: 640, issuedAgo: 18, term: 14, paidLate: null },
  ]},
  { name: "Vantage Retail", email: "payables@vantage-retail.example.com", invoices: [
    { item: "Store signage design", amount: 500, issuedAgo: 130, term: 14, paidLate: 35 },
    { item: "Catalogue layout", amount: 720, issuedAgo: 95, term: 14, paidLate: 41 },
    { item: "Seasonal promo pack", amount: 980, issuedAgo: 45, term: 14, paidLate: null },
    { item: "Email templates", amount: 410, issuedAgo: 12, term: 14, paidLate: null },
  ]},
];

async function makeInvoice(c, inv) {
  const invoiceDate = iso(-inv.issuedAgo);
  const dueDate = iso(-inv.issuedAgo + inv.term);
  const next = await call("/v2/invoicing/generate-next-invoice-number", "POST");
  const body = {
    detail: {
      invoice_number: next.invoice_number,
      invoice_date: invoiceDate,
      currency_code: "USD",
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: dueDate },
    },
    primary_recipients: [{ billing_info: { name: { business_name: c.name }, email_address: c.email } }],
    items: [{ name: inv.item, quantity: "1", unit_amount: { currency_code: "USD", value: inv.amount.toFixed(2) } }],
  };
  if (process.env.PAYPAL_BUSINESS_EMAIL) body.invoicer = { email_address: process.env.PAYPAL_BUSINESS_EMAIL };
  const created = await call("/v2/invoicing/invoices", "POST", body);
  const invId = created.href.split("/").pop();
  await call(`/v2/invoicing/invoices/${invId}/send`, "POST", { send_to_recipient: true, send_to_invoicer: false });
  if (inv.paidLate !== null) {
    const paidDate = iso(-inv.issuedAgo + inv.term + inv.paidLate);
    await call(`/v2/invoicing/invoices/${invId}/payments`, "POST", {
      method: "BANK_TRANSFER",
      payment_date: paidDate,
      amount: { currency_code: "USD", value: inv.amount.toFixed(2) },
    });
  }
  return { invId, number: next.invoice_number, dueDate };
}

await auth();
let ok = 0, failed = 0;
for (const c of clients) {
  for (const inv of c.invoices) {
    try {
      const r = await makeInvoice(c, inv);
      ok++;
      console.log(`OK   ${c.name} #${r.number} due ${r.dueDate} ${inv.paidLate === null ? "(open)" : "(paid)"}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${c.name} "${inv.item}": ${e.message}`);
    }
  }
}
console.log(`\nDone. ${ok} created, ${failed} failed.`);
if (failed) console.log("Copy any FAIL lines and send them to Claude to fix.");
