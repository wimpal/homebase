export type ErrorCode =
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "unavailable"
  | "internal";

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  /** Stable machine key for UI i18n; optional. */
  readonly reason?: string;

  constructor(
    code: ErrorCode,
    message: string,
    retryable = false,
    reason?: string,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.retryable = retryable;
    this.reason = reason;
  }

  static notFound(message: string, reason?: string): DomainError {
    return new DomainError("not_found", message, false, reason);
  }

  static invalidInput(message: string, reason?: string): DomainError {
    return new DomainError("invalid_input", message, false, reason);
  }

  static conflict(message: string, reason?: string): DomainError {
    return new DomainError("conflict", message, false, reason);
  }

  static unavailable(message: string, reason?: string): DomainError {
    return new DomainError("unavailable", message, true, reason);
  }

  static internal(message: string, reason?: string): DomainError {
    return new DomainError("internal", message, false, reason);
  }

  toBody(): ErrorBody {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }

  toJson(): { error: ErrorBody } {
    return { error: this.toBody() };
  }
}

export type DomainResult<T> = T | DomainError;

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
