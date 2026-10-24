import { NextResponse } from "next/server";
import { getOverview } from "@/lib/data";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  try {
    const overview = await getOverview();
    return NextResponse.json({ overview, actions: store.actions, audit: store.audit });
  } catch (e: any) {
    return NextResponse.json({ overview: null, error: String(e?.message || e), actions: store.actions, audit: store.audit });
  }
}
