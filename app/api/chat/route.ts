import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const out = await runAgent(messages, "chat");
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ reply: `Error: ${String(e?.message || e)}`, steps: [] }, { status: 200 });
  }
}
