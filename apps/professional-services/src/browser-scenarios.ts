export interface BrowserScenarioResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

export interface BrowserScenarioHeaders {
  readonly tokenSuffix?: string;
  readonly idempotencyKey?: string;
  readonly expectedVersion?: string;
  readonly correlationId?: string;
  readonly mismatchedIrDigest?: string;
}

export type BrowserScenarioHeadersFactory = (
  options?: BrowserScenarioHeaders,
) => Promise<Headers>;

interface ConflictCheckResult {
  readonly id: string;
  readonly version: string;
  readonly status: string;
  readonly result?: string;
}

interface DecisionOperationResult {
  readonly operationId: string;
  readonly status: string;
  readonly auditId: string;
}

interface DecisionResult {
  readonly auditId: string;
  readonly outcome:
    | {
        readonly case: "operation";
        readonly value: DecisionOperationResult;
      }
    | {
        readonly case: "conflictCheck";
        readonly value: ConflictCheckResult;
      }
    | {
        readonly case: undefined;
        readonly value?: undefined;
      };
}

interface BrowserCallOptions {
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
}

export interface ProfessionalServicesScenarioClient {
  getConflictCheck(
    input: { readonly conflictCheckId: string },
    options?: BrowserCallOptions,
  ): Promise<{ readonly conflictCheck?: ConflictCheckResult }>;
  getConflictDecisionContext(
    input: { readonly conflictCheckId: string },
    options?: BrowserCallOptions,
  ): Promise<{
    readonly conflictCheck?: ConflictCheckResult;
    readonly evidence: readonly unknown[];
    readonly alternatives: readonly {
      readonly reasonRequired?: boolean;
    }[];
    readonly policyExplanation: string;
  }>;
  decideConflictCheck(
    input: {
      readonly conflictCheckId: string;
      readonly expectedVersion: string;
      readonly alternativeId: string;
      readonly reason: string;
    },
    options?: BrowserCallOptions,
  ): Promise<DecisionResult>;
}

export async function runEvidenceAndReasonScenarios(
  client: Pick<
    ProfessionalServicesScenarioClient,
    "getConflictDecisionContext" | "decideConflictCheck"
  >,
  headers: BrowserScenarioHeadersFactory,
): Promise<readonly BrowserScenarioResult[]> {
  const results: BrowserScenarioResult[] = [];
  const context = await client.getConflictDecisionContext(
    { conflictCheckId: "conflict-check-1" },
    { headers: await headers() },
  );
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  const alternatives = Array.isArray(context.alternatives)
    ? context.alternatives
    : [];
  results.push({
    name: "evidence context loads through generated Connect",
    ok:
      context.conflictCheck?.status === "pending" &&
      evidence.length === 2 &&
      alternatives.length === 3 &&
      alternatives.filter(
        (alternative: { reasonRequired?: boolean }) =>
          alternative.reasonRequired === true,
      ).length === 2 &&
      context.policyExplanation !== "",
  });
  results.push(
    await expectConnectCode(
      "reason-required rejection is enforced by Go",
      "invalid_argument",
      async () =>
        client.decideConflictCheck(
          {
            conflictCheckId: "conflict-check-1",
            expectedVersion: "1",
            alternativeId: "waiver_obtained",
            reason: "",
          },
          {
            headers: await headers({
              idempotencyKey: "browser-reason-required",
              expectedVersion: "1",
            }),
          },
        ),
    ),
  );
  return Object.freeze(results);
}

export async function runAuthorityAndInvariantScenarios(
  client: Pick<ProfessionalServicesScenarioClient, "decideConflictCheck">,
  headers: BrowserScenarioHeadersFactory,
): Promise<readonly BrowserScenarioResult[]> {
  return Object.freeze([
    await expectConnectCode(
      "authorization denial is enforced by Go",
      "permission_denied",
      async () =>
        client.decideConflictCheck(
          {
            conflictCheckId: "conflict-check-1",
            expectedVersion: "1",
            alternativeId: "clear",
            reason: "",
          },
          {
            headers: await headers({
              tokenSuffix: "-viewer",
              idempotencyKey: "browser-viewer-denied",
              expectedVersion: "1",
            }),
          },
        ),
    ),
    await expectConnectCode(
      "required evidence invariant is enforced by Go",
      "failed_precondition",
      async () =>
        client.decideConflictCheck(
          {
            conflictCheckId: "conflict-check-2",
            expectedVersion: "1",
            alternativeId: "clear",
            reason: "",
          },
          {
            headers: await headers({
              idempotencyKey: "browser-missing-evidence",
              expectedVersion: "1",
            }),
          },
        ),
    ),
    await expectConnectCode(
      "pending-state invariant is enforced by Go",
      "failed_precondition",
      async () =>
        client.decideConflictCheck(
          {
            conflictCheckId: "conflict-check-3",
            expectedVersion: "2",
            alternativeId: "clear",
            reason: "",
          },
          {
            headers: await headers({
              idempotencyKey: "browser-non-pending",
              expectedVersion: "2",
            }),
          },
        ),
    ),
  ]);
}

export async function runApprovalAndConcurrencyScenarios(
  client: Pick<
    ProfessionalServicesScenarioClient,
    "decideConflictCheck" | "getConflictCheck"
  >,
  headers: BrowserScenarioHeadersFactory,
): Promise<readonly BrowserScenarioResult[]> {
  const request = {
    conflictCheckId: "conflict-check-1",
    expectedVersion: "1",
    alternativeId: "clear",
    reason: "",
  };
  const first = await client.decideConflictCheck(request, {
    headers: await headers({
      idempotencyKey: "browser-approval",
      expectedVersion: "1",
      correlationId: "browser-correlation-approval",
    }),
  });
  const operation =
    first.outcome?.case === "operation" ? first.outcome.value : undefined;
  const results: BrowserScenarioResult[] = [
    {
      name: "approval returns correlated audit and operation identities",
      ok:
        first.auditId !== "" &&
        operation?.operationId !== "" &&
        operation?.status === "succeeded" &&
        operation?.auditId === first.auditId,
    },
  ];

  const replay = await client.decideConflictCheck(request, {
    headers: await headers({
      idempotencyKey: "browser-approval",
      expectedVersion: "1",
      correlationId: "browser-correlation-replay",
    }),
  });
  const replayOperation =
    replay.outcome?.case === "operation" ? replay.outcome.value : undefined;
  results.push({
    name: "exact idempotent replay returns the original outcome",
    ok:
      replay.auditId === first.auditId &&
      replayOperation?.operationId === operation?.operationId,
  });

  results.push(
    await expectConnectCode(
      "changed-input idempotency reuse conflicts",
      "already_exists",
      async () =>
        client.decideConflictCheck(
          {
            ...request,
            alternativeId: "declined",
            reason: "Changed input",
          },
          {
            headers: await headers({
              idempotencyKey: "browser-approval",
              expectedVersion: "1",
              correlationId: "browser-correlation-conflict",
            }),
          },
        ),
    ),
  );

  const stale = await expectConnectCode(
    "stale state is rejected and authoritative state reloads",
    "aborted",
    async () =>
      client.decideConflictCheck(
        {
          ...request,
          alternativeId: "declined",
          reason: "Stale decision",
        },
        {
          headers: await headers({
            idempotencyKey: "browser-stale",
            expectedVersion: "1",
            correlationId: "browser-correlation-stale",
          }),
        },
      ),
  );
  const current = await client.getConflictCheck(
    { conflictCheckId: "conflict-check-1" },
    { headers: await headers() },
  );
  results.push({
    ...stale,
    ok:
      stale.ok &&
      current.conflictCheck?.version === "2" &&
      current.conflictCheck?.status === "cleared",
  });

  return Object.freeze(results);
}

export async function runContractMismatchScenario(
  client: Pick<ProfessionalServicesScenarioClient, "getConflictCheck">,
  headers: BrowserScenarioHeadersFactory,
): Promise<readonly BrowserScenarioResult[]> {
  const name = "per-request contract mismatch fails closed with correlation";
  try {
    await client.getConflictCheck(
      { conflictCheckId: "conflict-check-1" },
      {
        headers: await headers({
          correlationId: "browser-correlation-mismatch",
          mismatchedIrDigest: `sha256:${"0".repeat(64)}`,
        }),
      },
    );
    return Object.freeze([
      { name, ok: false, detail: "expected failed_precondition, got success" },
    ]);
  } catch (error) {
    const record =
      typeof error === "object" && error !== null
        ? (error as Readonly<Record<string, unknown>>)
        : {};
    const details = Array.isArray(record.details) ? record.details : [];
    const typed = details.find(
      (detail) =>
        typeof detail === "object" &&
        detail !== null &&
        String((detail as Readonly<Record<string, unknown>>).type).includes(
          "PreconditionErrorDetail",
        ),
    ) as Readonly<Record<string, unknown>> | undefined;
    const value =
      typeof typed?.value === "object" && typed.value !== null
        ? (typed.value as Readonly<Record<string, unknown>>)
        : {};
    const ok =
      record.code === "failed_precondition" &&
      value.reason === "contract_mismatch" &&
      value.correlationId === "browser-correlation-mismatch" &&
      correlationHeaderMatches(
        record.correlationId,
        "browser-correlation-mismatch",
      );
    return Object.freeze([
      {
        name,
        ok,
        ...(ok
          ? {}
          : {
              detail: JSON.stringify({
                code: record.code,
                responseCorrelationId: record.correlationId,
                detailType: typed?.type,
                reason: value.reason,
                detailCorrelationId: value.correlationId,
              }),
            }),
      },
    ]);
  }
}

function correlationHeaderMatches(value: unknown, expected: string): boolean {
  if (typeof value !== "string") return false;
  const identities = value
    .split(",")
    .map((identity) => identity.trim())
    .filter((identity) => identity !== "");
  return (
    identities.length > 0 &&
    identities.every((identity) => identity === expected)
  );
}

async function expectConnectCode(
  name: string,
  expected: string,
  run: () => Promise<unknown>,
): Promise<BrowserScenarioResult> {
  try {
    await run();
    return { name, ok: false, detail: `expected ${expected}, got success` };
  } catch (error) {
    const code = readString(error, "code");
    return code === expected
      ? { name, ok: true }
      : { name, ok: false, detail: `expected ${expected}, got ${code}` };
  }
}

function readString(value: unknown, key: string): string {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)[key] === "string"
    ? String((value as Record<string, unknown>)[key])
    : "unknown";
}
