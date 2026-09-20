import { NextResponse } from "next/server";
import { auth } from "@/core/auth/config";
import { prisma } from "@/core/db";
import { isModuleEnabled } from "@/core/modules/settings";
import { isDomainError } from "@/domain/error";
import { fetchReolinkSnapshot, parseReolinkCameraConfig } from "@/domain/smarthome";
import { ModuleId } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.user?.householdId;
  if (!userId || !householdId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_householdId: { userId, householdId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isModuleEnabled(householdId, ModuleId.SMART_HOME))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const device = await prisma.device.findFirst({
    where: { id, householdId, type: "CAMERA" },
  });
  if (!device) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reolink = parseReolinkCameraConfig(device.config);
  if (!reolink) {
    return NextResponse.json(
      { error: "Camera does not support RTSP snapshot preview" },
      { status: 400 },
    );
  }

  const result = await fetchReolinkSnapshot(reolink);
  if (isDomainError(result)) {
    const status = result.code === "invalid_input" ? 400 : 502;
    return NextResponse.json(
      { error: result.message },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return new NextResponse(new Uint8Array(result), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
    },
  });
}
