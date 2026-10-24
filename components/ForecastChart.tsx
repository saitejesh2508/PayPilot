"use client";

type P = { date: string; expected: number; ifOnTime: number };

export default function ForecastChart({ points, currency }: { points: P[]; currency: string }) {
  if (!points?.length) return <div className="empty">No open invoices to forecast.</div>;
  const W = 760, H = 240, L = 62, R = 16, T = 14, B = 30;
  const max = Math.max(1, ...points.map((p) => Math.max(p.expected, p.ifOnTime)));
  const nice = Math.ceil(max / 1000) * 1000 || 1000;
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const line = (key: "expected" | "ifOnTime") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(nice * f));
  const xt = [0, 10, 20, 30];
  const last = points[points.length - 1];
  return (
    <div className="chartwrap">
      <div className="legend">
        <span><i style={{ background: "#0b57d0" }} />Expected, weighted by client risk</span>
        <span><i style={{ background: "#98a2b3" }} />If every client paid on time</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="30-day cash collection forecast" style={{ minWidth: 520 }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eaecf0" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#667085">{fmt(t)}</text>
          </g>
        ))}
        {xt.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="#667085">
            {d === 0 ? "Today" : `+${d}d`}
          </text>
        ))}
        <path d={line("ifOnTime")} fill="none" stroke="#98a2b3" strokeWidth="2" strokeDasharray="5 4" />
        <path d={line("expected")} fill="none" stroke="#0b57d0" strokeWidth="3" />
        <circle cx={x(points.length - 1)} cy={y(last.expected)} r="4" fill="#0b57d0" />
        <text x={x(points.length - 1) - 8} y={y(last.expected) - 10} textAnchor="end" fontSize="12" fontWeight="600" fill="#0b57d0">
          {fmt(last.expected)}
        </text>
      </svg>
    </div>
  );
}
