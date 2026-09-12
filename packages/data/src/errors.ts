export type OUIOperationErrorKind =
  | "cancelled"
  | "conflict"
  | "internal"
  | "permission"
  | "stale_state"
  | "unavailable"
  | "validation";

export interface ConnectFailureDetail {
  readonly type: string;
  readonly value?: unknown;
}

export interface ConnectFailureShape {
  readonly code?: string;
  readonly message?: string;
  readonly correlationId?: string;
  readonly details?: readonly ConnectFailureDetail[];
}

export class OUIOperationError extends Error {
  readonly kind: OUIOperationErrorKind;
  readonly operationId: string;
  readonly retryable: boolean;
  readonly correlationId?: string;
  readonly details?: unknown;

  constructor(options: {
    readonly kind: OUIOperationErrorKind;
    readonly operationId: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly correlationId?: string;
    readonly details?: unknown;
  }) {
    super(options.message);
    this.name = "OUIOperationError";
    this.kind = options.kind;
    this.operationId = options.operationId;
    this.retryable = options.retryable;
    if (options.correlationId !== undefined) {
      this.correlationId = options.correlationId;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export function mapOperationError(
  operationId: string,
  cause: unknown,
  signal?: AbortSignal,
): OUIOperationError {
  if (cause instanceof OUIOperationError) {
    return cause;
  }
  if (signal?.aborted === true || isAbortError(cause)) {
    return new OUIOperationError({
      kind: "cancelled",
      operationId,
      message: "The operation was cancelled.",
      retryable: false,
    });
  }

  const failure = toFailureShape(cause);
  const detail = failure.details?.[0];
  const correlationId = failure.correlationId ?? detailCorrelationId(detail);
  const common = {
    operationId,
    message: failure.message ?? `Operation ${operationId} failed.`,
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(detail?.value === undefined ? {} : { details: detail.value }),
  };

  if (failure.code === "invalid_argument") {
    return new OUIOperationError({
      ...common,
      kind: "validation",
      retryable: false,
    });
  }
  if (
    failure.code === "permission_denied" ||
    failure.code === "unauthenticated"
  ) {
    return new OUIOperationError({
      ...common,
      kind: "permission",
      retryable: false,
    });
  }
  if (
    (failure.code === "aborted" || failure.code === "failed_precondition") &&
    failure.details?.some(({ type }) => type.includes("StaleState")) === true
  ) {
    return new OUIOperationError({
      ...common,
      kind: "stale_state",
      retryable: false,
    });
  }
  if (failure.code === "aborted" || failure.code === "already_exists") {
    return new OUIOperationError({
      ...common,
      kind: "conflict",
      retryable: false,
    });
  }
  if (failure.code === "unavailable" || failure.code === "deadline_exceeded") {
    return new OUIOperationError({
      ...common,
      kind: "unavailable",
      retryable: true,
    });
  }
  if (failure.code === "canceled" || failure.code === "cancelled") {
    return new OUIOperationError({
      ...common,
      kind: "cancelled",
      retryable: false,
    });
  }

  return new OUIOperationError({
    ...common,
    kind: "internal",
    retryable: true,
  });
}

function toFailureShape(cause: unknown): ConnectFailureShape {
  if (typeof cause !== "object" || cause === null) {
    return { message: String(cause) };
  }
  const candidate = cause as ConnectFailureShape;
  return {
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.message === "string"
      ? { message: candidate.message }
      : {}),
    ...(typeof candidate.correlationId === "string"
      ? { correlationId: candidate.correlationId }
      : {}),
    ...(Array.isArray(candidate.details) ? { details: candidate.details } : {}),
  };
}

function detailCorrelationId(
  detail: ConnectFailureDetail | undefined,
): string | undefined {
  if (
    detail?.value !== null &&
    typeof detail?.value === "object" &&
    "correlationId" in detail.value &&
    typeof detail.value.correlationId === "string"
  ) {
    return detail.value.correlationId;
  }
  return undefined;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException
    ? cause.name === "AbortError"
    : cause instanceof Error && cause.name === "AbortError";
}
