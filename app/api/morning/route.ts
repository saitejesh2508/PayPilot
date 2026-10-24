import { NextResponse } from "next/server";
import { runAgent, MORNING_PROMPT } from "@/lib/agent";
import { addAudit } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    addAudit("agent", "Morning review started");
    const out = await runAgent([{ role: "user", text: MORNING_PROMPT }], "morning");
    addAudit("agent", "Morning review finished");
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ reply: `Error: ${String(e?.message || e)}`, steps: [] }, { status: 200 });
  }
}
