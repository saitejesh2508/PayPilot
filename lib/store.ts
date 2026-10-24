// Tiny JSON-file store for the approval queue and audit log (no native deps).
import fs from "fs";
import path from "path";
import crypto from "crypto";

export type ActionType = "send_reminder" | "create_invoice";
export type Action = {
  id: string;
  type: ActionType;
  status: "pending" | "approved" | "rejected" | "failed";
  source: "chat" | "morning";
  createdAt: string;
  decidedAt?: string;
  summary: string;
  reasoning: string;
  params: any;
  result?: string;
  error?: string;
};
export type AuditEntry = { ts: string; kind: string; text: string };
type Data = { actions: Action[]; audit: AuditEntry[] };

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "store.json");

function read(): Data {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { actions: [], audit: [] };
  }
}
function write(d: Data) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

export function getStore(): Data {
  return read();
}

export function addAudit(kind: string, text: string) {
  const d = read();
  d.audit.unshift({ ts: new Date().toISOString(), kind, text });
  d.audit = d.audit.slice(0, 200);
  write(d);
}

export function addAction(a: Omit<Action, "id" | "status" | "createdAt">): Action {
  const d = read();
  const action: Action = { ...a, id: crypto.randomUUID(), status: "pending", createdAt: new Date().toISOString() };
  d.actions.unshift(action);
  d.audit.unshift({ ts: action.createdAt, kind: "proposed", text: action.summary });
  write(d);
  return action;
}

export function updateAction(id: string, patch: Partial<Action>): Action | null {
  const d = read();
  const a = d.actions.find((x) => x.id === id);
  if (!a) return null;
  Object.assign(a, patch);
  write(d);
  return a;
}

export function hasPendingForInvoice(invoiceId: string): boolean {
  return read().actions.some((a) => a.status === "pending" && a.type === "send_reminder" && a.params?.invoiceId === invoiceId);
}

// Days since the last APPROVED reminder for this invoice (null = never reminded).
export function daysSinceReminder(invoiceId: string): number | null {
  const last = read()
    .actions.filter((a) => a.type === "send_reminder" && a.status === "approved" && a.params?.invoiceId === invoiceId && a.decidedAt)
    .sort((x, y) => String(y.decidedAt).localeCompare(String(x.decidedAt)))[0];
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last.decidedAt as string).getTime()) / 86400000);
}
