"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { notify } from "@/core/notifications/service";
import { NotificationType, RequestType, Role } from "@prisma/client";
import {
  type ActionResult,
  failResult,
  okResult,
} from "@/lib/action-result";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const DESCRIPTION_MAX = 2000;
const FIELD_VALUE_MAX = 200;

/** Fields allowed in client-supplied diagnostics (never secrets). */
const GLOBAL_DIAGNOSTIC_ALLOWLIST = new Set([
  "name",
  "title",
  "quantity",
  "status",
  "id",
  "carrier",
  "type",
  "kind",
  "category",
  "location",
  "unit",
]);

export type ReportFormErrorInput = {
  reason?: string;
  message: string;
  actionName: string;
  pathname: string;
  diagnostics?: Record<string, string>;
};

function sanitizeDiagnostics(
  input: Record<string, string> | undefined,
): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!GLOBAL_DIAGNOSTIC_ALLOWLIST.has(key)) continue;
    const trimmed = String(value).trim().slice(0, FIELD_VALUE_MAX);
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

function buildDescription(parts: {
  reason?: string;
  message: string;
  actionName: string;
  pathname: string;
  userId: string;
  diagnostics: Record<string, string>;
}): string {
  const lines = [
    `Reason: ${parts.reason ?? "(none)"}`,
    `Message: ${parts.message}`,
    `Action: ${parts.actionName}`,
    `Path: ${parts.pathname}`,
    `User: ${parts.userId}`,
    `Time: ${new Date().toISOString()}`,
  ];
  const diagKeys = Object.keys(parts.diagnostics);
  if (diagKeys.length > 0) {
    lines.push("Fields:");
    for (const key of diagKeys) {
      lines.push(`  ${key}=${parts.diagnostics[key]}`);
    }
  }
  return lines.join("\n").slice(0, DESCRIPTION_MAX);
}

/**
 * Creates an admin-only SUPPORT request from an ErrorDialog report.
 * Does not require the Messaging module (household members can always report).
 */
export async function reportFormErrorToAdminAction(
  input: ReportFormErrorInput,
): Promise<ActionResult> {
  const { householdId, userId } = await requireHousehold();

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await prisma.request.count({
    where: {
      householdId,
      userId,
      type: RequestType.SUPPORT,
      createdAt: { gte: since },
    },
  });
  if (recent >= RATE_LIMIT_MAX) {
    return failResult(
      "Too many error reports recently.",
      "report_rate_limited",
    );
  }

  const diagnostics = sanitizeDiagnostics(input.diagnostics);
  const reason = input.reason?.trim().slice(0, 120) || undefined;
  const message = input.message.trim().slice(0, 500) || "Unknown error";
  const actionName = input.actionName.trim().slice(0, 120) || "unknown";
  const pathname = input.pathname.trim().slice(0, 200) || "/";

  const description = buildDescription({
    reason,
    message,
    actionName,
    pathname,
    userId,
    diagnostics,
  });

  const title = `Form error: ${reason ?? actionName}`.slice(0, 200);

  await prisma.request.create({
    data: {
      householdId,
      userId,
      type: RequestType.SUPPORT,
      title,
      description,
    },
  });

  const admins = await prisma.membership.findMany({
    where: { householdId, role: Role.ADMIN },
    select: { userId: true },
  });

  await Promise.all(
    admins.map((admin) =>
      notify({
        householdId,
        userId: admin.userId,
        type: NotificationType.INFO,
        title: "Form error report",
        message: title,
        link: "/messages",
      }),
    ),
  );

  return okResult();
}

/** Admin-only SUPPORT queue; works even if Messaging module is off. */
export async function getSupportRequests() {
  const { householdId, role } = await requireHousehold();
  if (role !== Role.ADMIN) return [];
  return prisma.request.findMany({
    where: { householdId, type: RequestType.SUPPORT },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}
