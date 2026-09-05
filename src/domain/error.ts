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

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.retryable = retryable;
  }

  static notFound(message: string): DomainError {
    return new DomainError("not_found", message, false);
  }

  static invalidInput(message: string): DomainError {
    return new DomainError("invalid_input", message, false);
  }

  static conflict(message: string): DomainError {
    return new DomainError("conflict", message, false);
  }

  static unavailable(message: string): DomainError {
    return new DomainError("unavailable", message, true);
  }

  static internal(message: string): DomainError {
    return new DomainError("internal", message, false);
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
