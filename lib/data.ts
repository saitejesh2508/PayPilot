import { fetchInvoiceDetails } from "./paypal";
import { normalize, clientRisk, forecast30, kpis, Inv } from "./analytics";

let cache: { at: number; value: any } | null = null;

export function invalidate() {
  cache = null;
}

export async function getOverview() {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const raw = await fetchInvoiceDetails();
  const invoices = raw.map(normalize).filter(Boolean) as Inv[];
  invoices.sort((a, b) => (b.daysOverdue - a.daysOverdue) || a.dueDate.localeCompare(b.dueDate));
  const risk = clientRisk(invoices);
  const fc = forecast30(invoices, risk);
  const value = { invoices, risk, forecast: fc, kpis: kpis(invoices, fc) };
  cache = { at: Date.now(), value };
  return value;
}
