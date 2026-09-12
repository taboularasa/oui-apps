import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useMachine } from "@xstate/react";
import type {
  ApplicationDefinition,
  InteractionDefinition,
  SessionContext,
} from "@oui/core";
import {
  OUIOperationError,
  createIdempotencyIdentityStore,
  type OUIOperationRuntime,
} from "@oui/data";
import {
  Button,
  Checkbox,
  Feedback,
  Field,
  Inline,
  Stack,
  Status,
} from "@oui/react-aria";
import {
  compileDecisionPattern,
  decisionConfirmationMessage,
  evaluateDecisionPreconditions,
  materializeDecisionCommandInput,
  materializeDecisionQueryInput,
  type DecisionAlternativeModel,
} from "./compiler";
import { createDecisionMachine } from "./machine";

export interface DecisionPatternProps {
  readonly application: ApplicationDefinition;
  readonly interaction: InteractionDefinition;
  readonly session: SessionContext;
  readonly operationRuntime: OUIOperationRuntime;
  readonly operationStream?: {
    readonly serviceId: string;
    readonly method: string;
  };
  readonly parameters: Readonly<Record<string, string | number>>;
}

interface DecisionQuerySnapshot {
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: unknown;
  readonly loading: boolean;
}

export function DecisionPattern({
  application,
  interaction,
  session,
  operationRuntime,
  operationStream,
  parameters,
}: DecisionPatternProps): ReactElement {
  const model = useMemo(
    () => compileDecisionPattern(application, interaction, session),
    [application, interaction, session],
  );
  const input = useMemo(
    () => materializeDecisionQueryInput(model, parameters),
    [model, parameters],
  );
  const { snapshot, refresh } = useDecisionQuery(
    operationRuntime,
    model.query.id,
    input,
  );
  const machine = useMemo(
    () =>
      createDecisionMachine({
        evidenceRequired: model.evidenceRequiredBeforeAction,
        alternatives: Object.fromEntries(
          model.alternatives.map((alternative) => [
            alternative.id,
            {
              available: alternative.available,
              reasonRequired: alternative.reason === "required",
              confirmationRequired: alternative.confirmationRequired,
            },
          ]),
        ),
      }),
    [model],
  );
  const [state, send] = useMachine(machine);
  const confirmation = useRef<HTMLElement>(null);
  const idempotency = useRef(createIdempotencyIdentityStore());
  const subject = readRecord(readPath(snapshot.output, model.subjectPath));
  const evidence = readArray(readPath(snapshot.output, model.evidencePath));
  const policy =
    model.policyPath === undefined
      ? undefined
      : readPath(snapshot.output, model.policyPath);
  const preconditions =
    subject === undefined ? [] : evaluateDecisionPreconditions(model, subject);
  const preconditionsSatisfied = preconditions.every(
    ({ satisfied }) => satisfied,
  );
  const selected = model.alternatives.find(
    ({ id }) => id === state.context.selectedAlternative,
  );

  useEffect(() => {
    if (state.matches("confirming")) {
      confirmation.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    if (
      !state.matches("submitting") ||
      selected === undefined ||
      snapshot.output === undefined
    ) {
      return undefined;
    }
    const controller = new AbortController();
    const commandInput = materializeDecisionCommandInput(
      selected,
      snapshot.output,
      parameters,
      state.context.reason,
    );
    const idempotencyKey =
      selected.command.idempotency === "prohibited"
        ? undefined
        : idempotency.current.forInput(selected.command.id, commandInput);
    void operationRuntime
      .command(selected.command.id, commandInput, {
        signal: controller.signal,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      })
      .then((output) => {
        if (idempotencyKey !== undefined) {
          idempotency.current.complete(selected.command.id, commandInput);
        }
        send({ type: "RESOLVE", output });
      })
      .catch((error: unknown) => {
        if (
          error instanceof OUIOperationError &&
          (error.kind === "stale_state" || error.kind === "conflict")
        ) {
          send({ type: "CONFLICT", error });
        } else if (!(
          error instanceof OUIOperationError && error.kind === "cancelled"
        )) {
          send({ type: "REJECT", error });
        }
      });
    return () => {
      controller.abort();
    };
  }, [operationRuntime, parameters, selected, send, snapshot.output, state]);

  if (snapshot.loading && snapshot.output === undefined) {
    return (
      <Status busy label="Decision loading status">
        Loading decision context
      </Status>
    );
  }
  if (snapshot.error !== undefined) {
    return (
      <Feedback kind="error">
        The decision context could not be loaded.{" "}
        <Button onAction={refresh}>Retry</Button>
      </Feedback>
    );
  }
  if (subject === undefined || snapshot.output === undefined) {
    return (
      <Feedback kind="warning">The decision subject is not available.</Feedback>
    );
  }

  if (state.matches("success")) {
    return (
      <DecisionOutcome
        alternative={selected}
        actor={model.authority.actorName}
        operationRuntime={operationRuntime}
        operationStream={operationStream}
        output={state.context.outcome}
      />
    );
  }
  if (state.matches("conflict")) {
    return (
      <Stack gap="section">
        <Feedback kind="warning">
          This proposal changed or was decided by someone else. Refresh the
          evidence and review the current state before deciding.
        </Feedback>
        <Button
          onAction={() => {
            refresh();
            send({ type: "REFRESH" });
          }}
        >
          Refresh decision context
        </Button>
      </Stack>
    );
  }

  const unmetRequirements = [
    ...(model.authority.available
      ? []
      : ["You do not have authority to decide this proposal."]),
    ...preconditions
      .filter(({ satisfied }) => !satisfied)
      .map(({ explanation }) => explanation),
    ...(model.evidenceRequiredBeforeAction && !state.context.evidenceReviewed
      ? ["Review the required evidence before choosing an outcome."]
      : []),
    ...(selected?.reason === "required" && state.context.reason.trim() === ""
      ? ["Enter a reason for rejection."]
      : []),
  ];
  const canRequest =
    model.authority.available &&
    preconditionsSatisfied &&
    (!model.evidenceRequiredBeforeAction || state.context.evidenceReviewed) &&
    selected?.available === true &&
    (selected.reason !== "required" || state.context.reason.trim() !== "");

  return (
    <Stack gap="section">
      <header>
        <h1>{label(interaction)}</h1>
        <h2>{formatValue(subject.title)}</h2>
        <p>{formatValue(subject.summary)}</p>
        <Status label="Subject status">{formatValue(subject.status)}</Status>
      </header>

      <section aria-label="Decision authority">
        <h2>Authority</h2>
        <p>
          Acting as{" "}
          <strong>{model.authority.actorName ?? "Unknown account"}</strong>.
        </p>
        <p>
          {model.authority.available
            ? "This account has authority to decide."
            : "This account may review but cannot decide."}
        </p>
      </section>

      <section aria-label="Policy explanation">
        <h2>Policy explanation</h2>
        <p>{formatValue(policy)}</p>
        <ul>
          {preconditions.map((precondition) => (
            <li key={precondition.id}>
              {precondition.satisfied ? "Satisfied: " : "Not satisfied: "}
              {precondition.explanation}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Required evidence">
        <h2>Evidence</h2>
        <EvidenceList evidence={evidence} />
        {model.evidenceRequiredBeforeAction ? (
          <Checkbox
            label="I reviewed the required evidence"
            onChange={(reviewed) => {
              send({ type: "EVIDENCE_REVIEWED", reviewed });
            }}
            selected={state.context.evidenceReviewed}
          />
        ) : null}
      </section>

      <section aria-label="Decision alternatives">
        <h2>Available outcomes</h2>
        <Stack>
          {model.alternatives.map((alternative) => (
            <div key={alternative.id}>
              <Button
                disabled={
                  !alternative.available ||
                  !model.authority.available ||
                  !preconditionsSatisfied ||
                  (model.evidenceRequiredBeforeAction &&
                    !state.context.evidenceReviewed)
                }
                onAction={() => {
                  send({
                    type: "SELECT",
                    alternativeId: alternative.id,
                  });
                }}
              >
                Choose {alternative.label}
              </Button>
              {alternative.available ? null : (
                <p>{alternative.unavailableExplanation}</p>
              )}
            </div>
          ))}
        </Stack>
      </section>

      {selected === undefined ? null : (
        <section aria-label="Selected outcome">
          <h2>{selected.label}</h2>
          <Field
            description={
              selected.reason === "required"
                ? "A reason is required for this outcome."
                : "You may add a reason for this outcome."
            }
            label="Decision reason"
            onChange={(reason) => {
              send({ type: "SET_REASON", reason });
            }}
            required={selected.reason === "required"}
            value={state.context.reason}
          />
          <Button
            busy={state.matches("submitting")}
            disabled={!canRequest || state.matches("submitting")}
            onAction={() => {
              send({ type: "REQUEST" });
            }}
          >
            Continue with {selected.label}
          </Button>
        </section>
      )}

      {unmetRequirements.length === 0 ? null : (
        <Feedback kind="warning">
          <strong>Action requirements</strong>
          <ul>
            {unmetRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </Feedback>
      )}

      {state.matches("confirming") && selected !== undefined ? (
        <section
          aria-label={`Confirm ${selected.label}`}
          ref={confirmation}
          role="alertdialog"
          tabIndex={-1}
        >
          <h2>Confirm decision</h2>
          <p>{decisionConfirmationMessage(selected)}</p>
          <Inline>
            <Button
              onAction={() => {
                send({ type: "CONFIRM" });
              }}
            >
              Confirm {selected.label}
            </Button>
            <Button
              onAction={() => {
                send({ type: "CANCEL_CONFIRMATION" });
              }}
            >
              Go back
            </Button>
          </Inline>
        </section>
      ) : null}

      {state.matches("failure") ? (
        <Feedback kind="error">
          The decision was not recorded.
          <Button
            onAction={() => {
              send({ type: "RETRY" });
            }}
          >
            Retry decision
          </Button>
        </Feedback>
      ) : null}

      <Status busy={state.matches("submitting")} label="Decision status">
        {state.matches("submitting")
          ? "Recording decision"
          : "Decision not yet recorded"}
      </Status>
    </Stack>
  );
}

function EvidenceList({
  evidence,
}: {
  readonly evidence: readonly unknown[];
}): ReactElement {
  if (evidence.length === 0) {
    return <p>No evidence was supplied.</p>;
  }
  return (
    <ul>
      {evidence.map((item, index) => {
        const record = readRecord(item);
        return (
          <li key={String(index)}>
            <strong>
              {formatValue(
                record?.label ?? record?.title ?? `Evidence ${index + 1}`,
              )}
            </strong>
            {record?.summary === undefined &&
            record?.value === undefined ? null : (
              <span>: {formatValue(record.summary ?? record.value)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DecisionOutcome({
  alternative,
  actor,
  operationRuntime,
  operationStream,
  output,
}: {
  readonly alternative: DecisionAlternativeModel | undefined;
  readonly actor: string | undefined;
  readonly operationRuntime: OUIOperationRuntime;
  readonly operationStream:
    { readonly serviceId: string; readonly method: string } | undefined;
  readonly output: unknown;
}): ReactElement {
  const result = readRecord(output);
  const operation = readRecord(result?.operation);
  const proposal = readRecord(result?.proposal);
  return (
    <section aria-label="Decision outcome">
      <h1>Decision recorded</h1>
      <Status label="Decision status">
        {alternative?.label ?? formatValue(operation?.alternative_id)}
      </Status>
      <dl>
        <dt>Outcome</dt>
        <dd>{alternative?.label ?? formatValue(operation?.alternative_id)}</dd>
        <dt>Actor</dt>
        <dd>
          {formatValue(operation?.actor_name ?? operation?.actor ?? actor)}
        </dd>
        <dt>Decided at</dt>
        <dd>{formatValue(operation?.decided_at)}</dd>
        <dt>Next state</dt>
        <dd>{formatValue(operation?.next_state ?? proposal?.status)}</dd>
      </dl>
      {operation === undefined || operationStream === undefined ? null : (
        <OperationProgress
          operation={operation}
          operationRuntime={operationRuntime}
          operationStream={operationStream}
        />
      )}
    </section>
  );
}

function OperationProgress({
  operation,
  operationRuntime,
  operationStream,
}: {
  readonly operation: Readonly<Record<string, unknown>>;
  readonly operationRuntime: OUIOperationRuntime;
  readonly operationStream: {
    readonly serviceId: string;
    readonly method: string;
  };
}): ReactElement {
  const operationId = formatValue(operation.operation_id);
  const initialResumeToken = formatValue(operation.resume_token);
  const [events, setEvents] = useState<
    readonly Readonly<Record<string, unknown>>[]
  >([]);
  const resumeToken = useRef(initialResumeToken);
  const [attempt, setAttempt] = useState(0);
  const [streamError, setStreamError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setStreamError(undefined);
    void (async () => {
      try {
        for await (const output of operationRuntime.stream<unknown>(
          operationStream.serviceId,
          operationStream.method,
          {
            operation_id: operationId,
            ...(resumeToken.current === ""
              ? {}
              : { resume_token: resumeToken.current }),
          },
          { signal: controller.signal },
        )) {
          if (!active) return;
          const event = readRecord(output);
          if (event === undefined) continue;
          setEvents((current) => [
            ...current.filter(
              (candidate) => candidate.sequence !== event.sequence,
            ),
            event,
          ]);
          const nextResumeToken = event.resume_token;
          if (typeof nextResumeToken === "string" && nextResumeToken !== "") {
            resumeToken.current = nextResumeToken;
          }
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setStreamError(
            cause instanceof Error
              ? cause.message
              : "The operation stream was interrupted.",
          );
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, operationId, operationRuntime, operationStream]);

  const latest = events.at(-1);
  const status = latest?.status ?? operation.status;
  return (
    <section aria-label="Operation progress">
      <h2>Operation progress</h2>
      <Status
        busy={!isTerminalOperationStatus(status)}
        label="Operation stream status"
      >
        {formatValue(status)}
      </Status>
      {latest?.progress === undefined ? null : (
        <p>Progress: {formatValue(latest.progress)}</p>
      )}
      {events.length === 0 ? (
        <p>Waiting for progress.</p>
      ) : (
        <>
          <ol>
            {events.map((event) => (
              <li key={formatValue(event.sequence)}>
                {formatValue(event.message)}
              </li>
            ))}
          </ol>
          <Button onAction={() => setAttempt((current) => current + 1)}>
            Resume from last event
          </Button>
        </>
      )}
      {streamError === undefined ? null : (
        <Feedback kind="error">
          {streamError}{" "}
          <Button onAction={() => setAttempt((current) => current + 1)}>
            Resume operation
          </Button>
        </Feedback>
      )}
    </section>
  );
}

export function isTerminalOperationStatus(status: unknown): boolean {
  return (
    typeof status === "string" &&
    ["succeeded", "failed", "cancelled", "expired"].includes(
      status.toLocaleLowerCase(),
    )
  );
}

function useDecisionQuery(
  runtime: OUIOperationRuntime,
  queryId: string,
  input: Readonly<Record<string, unknown>>,
): {
  readonly snapshot: DecisionQuerySnapshot;
  readonly refresh: () => void;
} {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<DecisionQuerySnapshot>({
    loading: true,
  });

  useEffect(() => {
    let active = true;
    setSnapshot((current) => ({
      ...current,
      error: undefined,
      loading: true,
    }));
    void runtime
      .query<Readonly<Record<string, unknown>>>(queryId, input)
      .then((output) => {
        if (active) {
          setSnapshot({ output, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSnapshot({ error, loading: false });
        }
      });
    return () => {
      active = false;
    };
  }, [input, queryId, refreshVersion, runtime]);

  return {
    snapshot,
    refresh: () => {
      setRefreshVersion((current) => current + 1);
    },
  };
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return typeof current === "object" &&
      current !== null &&
      !Array.isArray(current)
      ? (current as Readonly<Record<string, unknown>>)[segment]
      : undefined;
  }, value);
}

function readRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function label(interaction: InteractionDefinition): string {
  return interaction.label.fallback ?? interaction.label.id ?? interaction.id;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "Not provided";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
