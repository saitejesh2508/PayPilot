// Normalises PayPal invoices and computes client risk + cash-flow forecast.
export type Inv = {
  id: string;
  number: string;
  status: string;
  client: string;
  email: string;
  currency: string;
  amount: number;
  due: number; // amount still due
  invoiceDate: string;
  dueDate: string;
  paidDate: string | null;
  open: boolean;
  paid: boolean;
  daysOverdue: number;
  daysLate: number | null; // paid date minus due date (negative = early)
  payUrl: string; // payer-facing PayPal page for this invoice
};

const DAY = 86400000;
const parse = (s: string) => new Date(s + "T00:00:00Z").getTime();
export const todayStr = () => new Date().toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((parse(a) - parse(b)) / DAY);
const addDays = (s: string, n: number) => new Date(parse(s) + n * DAY).toISOString().slice(0, 10);

const OPEN = ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"];
const PAID = ["PAID", "MARKED_AS_PAID"];

export function normalize(raw: any): Inv | null {
  const status = String(raw?.status || "");
  if (!raw?.id || status === "DRAFT" || status === "CANCELLED") return null;
  const detail = raw.detail || {};
  const rec = raw.primary_recipients?.[0]?.billing_info || {};
  const client =
    rec.business_name ||
    rec.name?.business_name ||
    [rec.name?.given_name, rec.name?.surname].filter(Boolean).join(" ") ||
    rec.email_address ||
    "Unknown client";
  const invoiceDate = detail.invoice_date || todayStr();
  const dueDate = detail.payment_term?.due_date || addDays(invoiceDate, 30);
  const amount = Number(raw.amount?.value ?? 0);
  const open = OPEN.includes(status);
  const paid = PAID.includes(status);
  const dates: string[] = (raw.payments?.transactions || []).map((t: any) => t.payment_date).filter(Boolean).sort();
  const paidDate = paid ? dates[dates.length - 1] || null : null;
  const today = todayStr();
  const host = String(process.env.PAYPAL_BASE_URL || "").includes("sandbox") || !process.env.PAYPAL_BASE_URL ? "www.sandbox.paypal.com" : "www.paypal.com";
  const payUrl: string =
    detail.metadata?.recipient_view_url ||
    (String(raw.id).startsWith("INV2-") ? `https://${host}/invoice/p/#${String(raw.id).slice(5)}` : "");
  return {
    id: raw.id,
    number: detail.invoice_number || raw.id,
    status,
    client,
    email: rec.email_address || "",
    currency: detail.currency_code || raw.amount?.currency_code || "USD",
    amount,
    due: open ? Number(raw.due_amount?.value ?? amount) : 0,
    invoiceDate,
    dueDate,
    paidDate,
    open,
    paid,
    daysOverdue: open && dueDate < today ? diffDays(today, dueDate) : 0,
    daysLate: paid && paidDate ? diffDays(paidDate, dueDate) : null,
    payUrl,
  };
}

export type Risk = {
  client: string;
  email: string;
  paidCount: number;
  avgDaysLate: number | null;
  lateRate: number | null;
  openAmount: number;
  overdueAmount: number;
  overdueCount: number;
  maxOverdue: number;
  score: number;
  tier: "low" | "medium" | "high";
  note: string;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function clientRisk(invs: Inv[]): Risk[] {
  const groups = new Map<string, Inv[]>();
  for (const i of invs) {
    const k = (i.email || i.client).toLowerCase();
    groups.set(k, [...(groups.get(k) || []), i]);
  }
  const out: Risk[] = [];
  groups.forEach((list) => {
    const hist = list.filter((i) => i.paid && i.daysLate !== null);
    const open = list.filter((i) => i.open);
    const overdue = open.filter((i) => i.daysOverdue > 0);
    const avg = hist.length ? hist.reduce((s, i) => s + (i.daysLate as number), 0) / hist.length : null;
    const lateRate = hist.length ? hist.filter((i) => (i.daysLate as number) > 0).length / hist.length : null;
    const maxOverdue = overdue.reduce((m, i) => Math.max(m, i.daysOverdue), 0);
    let score: number;
    let note: string;
    if (avg === null) {
      score = overdue.length ? 55 : 30;
      note = "No payment history yet";
    } else {
      score = clamp(Math.round(clamp(avg, 0, 45) * 1.3 + (lateRate as number) * 25 + overdue.length * 10 + maxOverdue * 0.5), 0, 100);
      note = avg <= 0 ? "Pays on time or early" : `Pays about ${Math.round(avg)} days late on average`;
    }
    out.push({
      client: list[0].client,
      email: list[0].email,
      paidCount: hist.length,
      avgDaysLate: avg === null ? null : Math.round(avg * 10) / 10,
      lateRate: lateRate === null ? null : Math.round(lateRate * 100) / 100,
      openAmount: open.reduce((s, i) => s + i.due, 0),
      overdueAmount: overdue.reduce((s, i) => s + i.due, 0),
      overdueCount: overdue.length,
      maxOverdue,
      score,
      tier: score < 30 ? "low" : score < 60 ? "medium" : "high",
      note,
    });
  });
  return out.sort((a, b) => b.score - a.score);
}

export type ForecastPoint = { date: string; expected: number; ifOnTime: number };

export function forecast30(invs: Inv[], risks: Risk[]): ForecastPoint[] {
  const today = todayStr();
  const riskBy = new Map(risks.map((r) => [(r.email || r.client).toLowerCase(), r]));
  const items = invs
    .filter((i) => i.open)
    .map((i) => {
      const r = riskBy.get((i.email || i.client).toLowerCase());
      const delay = r && r.avgDaysLate !== null ? Math.max(r.avgDaysLate, 0) : 7;
      let expectedDate = addDays(i.dueDate, Math.round(delay));
      if (expectedDate < today) expectedDate = addDays(today, 3 + Math.round((r?.score ?? 50) / 10));
      const p = clamp(1 - (r?.score ?? 50) / 130, 0.3, 0.98);
      const bestDate = i.dueDate < today ? today : i.dueDate;
      return { amount: i.due, expectedDate, p, bestDate };
    });
  const points: ForecastPoint[] = [];
  for (let d = 0; d <= 30; d++) {
    const date = addDays(today, d);
    points.push({
      date,
      expected: Math.round(items.filter((x) => x.expectedDate <= date).reduce((s, x) => s + x.amount * x.p, 0)),
      ifOnTime: Math.round(items.filter((x) => x.bestDate <= date).reduce((s, x) => s + x.amount, 0)),
    });
  }
  return points;
}

export function kpis(invs: Inv[], fc: ForecastPoint[]) {
  const today = todayStr();
  const open = invs.filter((i) => i.open);
  const paid = invs.filter((i) => i.paid && i.daysLate !== null);
  const paidWithDates = invs.filter((i) => i.paid && i.paidDate);
  return {
    outstanding: open.reduce((s, i) => s + i.due, 0),
    overdue: open.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.due, 0),
    overdueCount: open.filter((i) => i.daysOverdue > 0).length,
    expected30: fc.length ? fc[fc.length - 1].expected : 0,
    avgDaysToPay: paidWithDates.length
      ? Math.round(paidWithDates.reduce((s, i) => s + diffDays(i.paidDate as string, i.invoiceDate), 0) / paidWithDates.length)
      : null,
    avgDaysLate: paid.length ? Math.round((paid.reduce((s, i) => s + (i.daysLate as number), 0) / paid.length) * 10) / 10 : null,
    currency: invs[0]?.currency || "USD",
    asOf: today,
  };
}
