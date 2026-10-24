"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ForecastChart from "@/components/ForecastChart";
import PayQR from "@/components/PayQR";

const InvoiceGrid = dynamic(() => import("@/components/InvoiceGrid"), { ssr: false, loading: () => <div className="empty">Loading grid…</div> });

type Msg = { role: "user" | "assistant"; text: string; steps?: string[] };

const SUGGESTIONS = [
  "Who owes me money right now?",
  "Which client is the biggest risk and why?",
  "How much cash should I expect in the next 30 days?",
  "Draft a $1,500 invoice for Northwind Studio for a website update",
  "Give me payment links for every overdue invoice",
];

const stepLabel: Record<string, string> = {
  list_invoices: "read invoices",
  client_risk: "scored client risk",
  cashflow_forecast: "ran cash forecast",
  get_payment_link: "fetched payment link",
  propose_reminder: "proposed a reminder",
  propose_invoice: "proposed an invoice",
};

export default function Home() {
  const [state, setState] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "I watch your PayPal invoices. Ask me who is late, who is risky, or what cash is coming. Anything that sends a reminder or an invoice waits in the approval queue until you approve it." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    setState(await r.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs, busy]);

  async function send(text: string, endpoint = "/api/chat") {
    if (busy) return;
    setBusy(true);
    const history: Msg[] = endpoint === "/api/chat" ? [...msgs, { role: "user", text }] : msgs;
    if (endpoint === "/api/chat") setMsgs(history);
    else setMsgs([...msgs, { role: "user", text: "Run the morning review" }]);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, text: m.text })) }),
      });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "assistant", text: d.reply, steps: d.steps }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", text: "Network error: " + String(e?.message || e) }]);
    }
    setBusy(false);
    refresh();
  }

  async function decide(id: string, decision: "approve" | "reject") {
    setDeciding(id);
    await fetch(`/api/actions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    setDeciding(null);
    refresh();
  }

  const ov = state?.overview;
  const k = ov?.kpis;
  const cur = k?.currency || "USD";
  const money = (n: number, c = cur) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);
  const actions: any[] = state?.actions || [];
  const pending = actions.filter((a) => a.status === "pending");
  const decided = actions.filter((a) => a.status !== "pending").slice(0, 5);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>PayPilot<span className="badge">PayPal sandbox</span></h1>
          <p>An AI agent that chases late PayPal invoices. You approve every action that moves money.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={refresh}>Refresh data</button>
          <button className="btn primary" disabled={busy} onClick={() => send("", "/api/morning")}>
            {busy ? "Working…" : "Run morning review"}
          </button>
        </div>
      </header>

      {state?.error && (
        <div className="banner" role="alert">
          Couldn't load PayPal data: {state.error}
        </div>
      )}

      <section className="kpis" aria-label="Key numbers">
        <div className="kpi"><div className="v num">{k ? money(k.outstanding) : "–"}</div><div className="l">Outstanding</div></div>
        <div className={"kpi" + (k && k.overdue > 0 ? " bad" : "")}>
          <div className="v num">{k ? money(k.overdue) : "–"}</div>
          <div className="l">Overdue{k ? ` (${k.overdueCount} invoice${k.overdueCount === 1 ? "" : "s"})` : ""}</div>
        </div>
        <div className="kpi"><div className="v num">{k ? money(k.expected30) : "–"}</div><div className="l">Expected in 30 days</div></div>
        <div className="kpi"><div className="v num">{k?.avgDaysToPay != null ? `${k.avgDaysToPay} days` : "–"}</div><div className="l">Average time to get paid</div></div>
      </section>

      <div className="grid2">
        <section className="panel" aria-label="Agent chat">
          <h2>Ask the agent</h2>
          <p className="sub">It reads your PayPal invoices and proposes actions. It cannot send anything on its own.</p>
          <div className="chatlog" ref={logRef}>
            {msgs.map((m, i) => (
              <div key={i} className={"msg " + m.role}>
                {m.text}
                {m.steps && m.steps.length > 0 && <span className="steps">Used: {Array.from(new Set(m.steps)).map((s) => stepLabel[s] || s).join(", ")}</span>}
              </div>
            ))}
            {busy && <div className="msg assistant">Working on it…</div>}
          </div>
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" disabled={busy} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
          <form className="chatform" onSubmit={(e) => { e.preventDefault(); if (input.trim()) { const t = input.trim(); setInput(""); send(t); } }}>
            <input aria-label="Message the agent" placeholder="Ask about invoices, clients or cash flow" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </section>

        <section className="panel" aria-label="Approval queue">
          <h2>Approval queue{pending.length ? ` (${pending.length})` : ""}</h2>
          <p className="sub">Nothing reaches PayPal until you approve it here.</p>
          <div className="queue">
            {pending.length === 0 && <div className="empty">Nothing waiting. Run the morning review and the agent will propose reminders for overdue invoices.</div>}
            {pending.map((a) => (
              <div key={a.id} className={"act " + (a.params?.tone || "")}>
                <div className="sum">{a.summary}</div>
                {a.reasoning && <div className="why">Why: {a.reasoning}</div>}
                {a.type === "send_reminder" && <div className="note"><strong>{a.params.subject}</strong>{"\n"}{a.params.note}</div>}
                {a.type === "send_reminder" && a.params.payUrl && (
                  <div className="payrow">
                    <PayQR url={a.params.payUrl} />
                    <div>
                      <div className="paylabel">Pay link included. The client can scan or click to pay.</div>
                      <a href={a.params.payUrl} target="_blank" rel="noreferrer">Open payment page</a>
                    </div>
                  </div>
                )}
                <div className="row">
                  <button className="btn primary" disabled={deciding === a.id} onClick={() => decide(a.id, "approve")}>{deciding === a.id ? "Sending…" : "Approve and send"}</button>
                  <button className="btn danger" disabled={deciding === a.id} onClick={() => decide(a.id, "reject")}>Reject</button>
                </div>
              </div>
            ))}
            {decided.length > 0 && (
              <div className="done">
                {decided.map((a) => (
                  <div key={a.id}>
                    {a.status === "approved" && <span className="ok">Done: </span>}
                    {a.status === "rejected" && <span>Rejected: </span>}
                    {a.status === "failed" && <span className="bad">Failed: </span>}
                    {a.status === "failed" ? a.error?.slice(0, 160) : a.result || a.summary}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel" aria-label="Cash flow forecast">
        <h2>30-day cash forecast</h2>
        <p className="sub">Each open invoice is expected to land after the client's usual delay, then weighted by how risky that client is.</p>
        <ForecastChart points={ov?.forecast || []} currency={cur} />
      </section>

      <section className="panel" aria-label="Client risk">
        <h2>Client risk</h2>
        <p className="sub">Scored from each client's payment history and what they currently owe.</p>
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr><th>Client</th><th>Risk</th><th>Pattern</th><th className="r">Open</th><th className="r">Overdue</th></tr>
            </thead>
            <tbody>
              {(ov?.risk || []).map((r: any) => (
                <tr key={r.email || r.client}>
                  <td><strong>{r.client}</strong></td>
                  <td>
                    <span className="bar" aria-hidden="true"><i style={{ width: r.score + "%" }} /></span>
                    <span className={"tier " + r.tier}>{r.tier} · {r.score}</span>
                  </td>
                  <td>{r.note}</td>
                  <td className="r num">{money(r.openAmount)}</td>
                  <td className="r num">{r.overdueAmount ? money(r.overdueAmount) : "–"}</td>
                </tr>
              ))}
              {!ov && <tr><td colSpan={5} className="empty">No data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-label="All invoices">
        <h2>All invoices</h2>
        <p className="sub">Live from PayPal. Click a column header to sort, use the filter icon to narrow down.</p>
        <InvoiceGrid rows={ov?.invoices || []} currency={cur} />
      </section>

      <section className="panel" aria-label="Activity log">
        <h2>Activity log</h2>
        <p className="sub">Every proposal, approval, rejection and failure, with timestamps.</p>
        <ul className="log">
          {(state?.audit || []).length === 0 && <li className="empty">No activity yet.</li>}
          {(state?.audit || []).map((a: any, i: number) => (
            <li key={i}>
              <time>{new Date(a.ts).toLocaleString()}</time>
              <span className="k">{a.kind}</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
