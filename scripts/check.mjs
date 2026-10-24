// Diagnoses PayPal sandbox permissions. Prints no secrets.
// Usage: node --env-file=.env.local scripts/check.mjs
const BASE = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
console.log("API host:", new URL(BASE).host);
if (!id || !secret) { console.log("Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET"); process.exit(1); }

const res = await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
const t = await res.json();
console.log("Token request:", res.status);
const scopes = String(t.scope || "").split(" ").filter(Boolean);
console.log("Scopes granted:", scopes.length);
console.log("Invoicing scope present:", scopes.some((s) => s.includes("invoic")) ? "YES" : "NO");
scopes.filter((s) => /invoic|payments|reporting|disputes/i.test(s)).forEach((s) => console.log("  -", s));

async function probe(label, path, method = "GET") {
  const r = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" } });
  const text = await r.text();
  console.log(`${label}: ${r.status}`, r.ok ? "" : text.slice(0, 200));
}
await probe("List invoices      ", "/v2/invoicing/invoices?page=1&page_size=5");
await probe("Next invoice number", "/v2/invoicing/generate-next-invoice-number", "POST");
