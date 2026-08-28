import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@/core/auth/config";
import { prisma } from "@/core/db";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  if (
    segments.length !== 3 ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\0"))
  ) {
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
  if (!membership || segments[0] !== householdId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const root = path.resolve(UPLOAD_DIR);
  const filepath = path.resolve(root, ...segments);
  if (!filepath.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = await readFile(filepath);
    const ext = path.extname(filepath).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" :
      ext === ".gif" ? "image/gif" :
      ext === ".webp" ? "image/webp" :
      "image/jpeg";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
