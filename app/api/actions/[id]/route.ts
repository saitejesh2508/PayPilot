import { NextResponse } from "next/server";
import { decide } from "@/lib/execute";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { decision } = await req.json();
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
    }
    const action = await decide(params.id, decision);
    return NextResponse.json({ action });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
