import { NextResponse } from "next/server";
import { readCollectorStatus } from "@/lib/collector-status";

export const dynamic = "force-dynamic";

export function GET() {
  const status = readCollectorStatus();
  const age = Date.now() - new Date(status.updatedAt).getTime();
  const watcherResponsive = status.watcherActive && age < 12 * 60_000;
  return NextResponse.json({ ...status, watcherActive: watcherResponsive });
}
