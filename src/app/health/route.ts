import { NextResponse } from "next/server";
import { prisma } from "@/core/db";

const VERSION = "0.1.0";

export async function GET() {
  let db: "ok" | "fail" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "fail";
  }

  const status = db === "ok" ? "ok" : "degraded";

  return NextResponse.json({
    service: "homebase",
    status,
    version: VERSION,
    checks: { db },
  });
}
