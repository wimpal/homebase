import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/core/db";
import { DomainError, type DomainResult } from "@/domain/error";
import { canonicalizeEmail, isValidEmail } from "./email";
import { isSmtpConfigured, sendPasswordResetEmail } from "./mail";

const MIN_PASSWORD_LEN = 8;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const MIN_RESEND_INTERVAL_MS = 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type RequestPasswordResetResult =
  | { status: "smtp_unset" }
  | { status: "accepted" };

export async function requestPasswordReset(
  emailRaw: string,
): Promise<DomainResult<RequestPasswordResetResult>> {
  if (!isSmtpConfigured()) {
    return { status: "smtp_unset" };
  }

  const email = canonicalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    // Still generic — do not leak validation differences for missing accounts.
    return { status: "accepted" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { status: "accepted" };
  }

  const recent = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      createdAt: { gt: new Date(Date.now() - MIN_RESEND_INTERVAL_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return { status: "accepted" };
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(raw)}`;

  try {
    await sendPasswordResetEmail({ to: user.email, resetUrl });
  } catch {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    return DomainError.unavailable(
      "Could not send reset email. Try again later or ask an ADMIN.",
      "smtp_send_failed",
    );
  }

  return { status: "accepted" };
}

export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
): Promise<DomainResult<{ ok: true }>> {
  if (!rawToken || rawToken.length < 16) {
    return DomainError.invalidInput("Invalid or expired reset link.", "token_invalid");
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    return DomainError.invalidInput(
      `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
      "password_too_short",
    );
  }

  const tokenHash = hashToken(rawToken);
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) {
      await prisma.passwordResetToken.delete({ where: { id: row.id } }).catch(() => {});
    }
    return DomainError.invalidInput("Invalid or expired reset link.", "token_invalid");
  }

  // timingSafeEqual on equal-length hashes (both sha256 hex)
  const a = Buffer.from(row.tokenHash, "utf8");
  const b = Buffer.from(tokenHash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return DomainError.invalidInput("Invalid or expired reset link.", "token_invalid");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId } });
  });

  return { ok: true };
}
