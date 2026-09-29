import { DomainError } from "@/domain/error";

/**
 * Best-effort rejection of password-/token-/Wi‑Fi-key-like note content.
 * Not a security boundary — Notes are convenience text, not a vault.
 */
const KEYWORD_RE =
  /\b(password|passwd|wachtwoord|passphrase|api[_\s-]?key|api[_\s-]?token|access[_\s-]?token|secret[_\s-]?key|private[_\s-]?key|wifi\s*(password|wachtwoord|key|psk)|ssid\s*[:=])/i;

const ASSIGNMENT_RE =
  /\b(password|passwd|wachtwoord|passphrase|api[_\s-]?key|api[_\s-]?token|token|secret|psk)\s*[:=]\s*\S+/i;

const BEARER_RE = /\bAuthorization\s*:\s*Bearer\s+\S+/i;

const TOKEN_PREFIX_RE = /\b(sk|pk|ghp|gho|xox[baprs]|AIza)[-_][A-Za-z0-9_-]{16,}\b/;

const SECRET_REJECT_MESSAGE =
  "Notes cannot store passwords, Wi-Fi keys, or API tokens. Use a password manager instead.";

export function rejectSecretLikeContent(
  title: string | null | undefined,
  body: string,
): DomainError | null {
  const combined = `${title ?? ""}\n${body}`;
  if (
    KEYWORD_RE.test(combined) ||
    ASSIGNMENT_RE.test(combined) ||
    BEARER_RE.test(combined) ||
    TOKEN_PREFIX_RE.test(combined)
  ) {
    return DomainError.invalidInput(
      SECRET_REJECT_MESSAGE,
      "secret_content_rejected",
    );
  }
  return null;
}
