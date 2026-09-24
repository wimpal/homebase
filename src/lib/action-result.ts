import { type DomainError, isDomainError } from "@/domain/error";

/** Non-throwing result for expected form / mutation failures. */
export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; reason?: string; message: string };

export function okResult<T = void>(data?: T): ActionResult<T> {
  return data === undefined ? { ok: true } : { ok: true, data };
}

export function failResult(
  message: string,
  reason?: string,
): ActionResult<never> {
  return { ok: false, reason, message };
}

export function fromDomainError(err: DomainError): ActionResult<never> {
  return failResult(err.message, err.reason);
}

/** Map a DomainResult to ActionResult; pass-through successes. */
export function fromDomainResult<T>(
  result: T | DomainError,
): ActionResult<T> {
  if (isDomainError(result)) return fromDomainError(result);
  return okResult(result);
}

/**
 * Convert only expected DomainError codes to ActionResult.
 * Rethrows anything else (auth, redirect, unexpected).
 */
export function catchExpected(
  err: unknown,
  expected: ReadonlyArray<DomainError["code"]> = [
    "invalid_input",
    "conflict",
    "not_found",
  ],
): ActionResult<never> {
  if (isDomainError(err) && expected.includes(err.code)) {
    return fromDomainError(err);
  }
  throw err;
}
