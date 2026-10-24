import { createAndSendInvoice, sendReminder } from "./paypal";
import { invalidate } from "./data";
import { addAudit, getStore, updateAction } from "./store";

export async function decide(id: string, decision: "approve" | "reject") {
  const action = getStore().actions.find((a) => a.id === id);
  if (!action) throw new Error("Action not found");
  if (action.status !== "pending") throw new Error(`Action already ${action.status}`);
  const now = new Date().toISOString();

  if (decision === "reject") {
    addAudit("rejected", action.summary);
    return updateAction(id, { status: "rejected", decidedAt: now });
  }

  try {
    let result = "";
    if (action.type === "send_reminder") {
      const p = action.params;
      await sendReminder(p.invoiceId, p.subject, p.note);
      result = `Reminder sent for invoice ${p.number}`;
    } else {
      const r = await createAndSendInvoice(action.params);
      result = `Invoice ${r.number} created and sent`;
    }
    invalidate();
    addAudit("executed", `${action.summary} — ${result}`);
    return updateAction(id, { status: "approved", decidedAt: now, result });
  } catch (e: any) {
    const error = String(e?.message || e);
    addAudit("failed", `${action.summary} — ${error.slice(0, 200)}`);
    return updateAction(id, { status: "failed", decidedAt: now, error });
  }
}
