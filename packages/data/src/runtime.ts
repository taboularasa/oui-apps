import { QueryClient, type QueryKey } from "@tanstack/query-core";
import type {
  ApplicationDefinition,
  CommandDefinition,
  QueryDefinition,
  SessionContext,
} from "@oui/core";
import { OUIOperationError, mapOperationError } from "./errors";
import type { ConnectClientRegistry } from "./transport";

export interface OperationMetadata {
  readonly accessToken?: string;
  readonly traceparent?: string;
  readonly tracestate?: string;
  readonly correlationId?: string;
  readonly deadlineMs?: number;
}

export interface OperationMetadataProvider {
  getMetadata(): OperationMetadata | Promise<OperationMetadata>;
}

export interface CreateOperationRuntimeOptions {
  readonly application: ApplicationDefinition;
  readonly clients: ConnectClientRegistry;
  readonly identity: OperationContractIdentity;
  readonly session: SessionContext;
  readonly metadata?: OperationMetadataProvider;
  readonly queryClient?: QueryClient;
}

export interface OperationContractIdentity {
  readonly applicationId: string;
  readonly irVersion: string;
  readonly irDigest: string;
  readonly bffPlanDigest: string;
  readonly descriptorDigest: string;
  readonly contractDigest: string;
  readonly runtimeVersion: string;
}

export interface CreateOperationHeadersOptions {
  readonly identity: OperationContractIdentity;
  readonly session: SessionContext;
  readonly metadata?: OperationMetadataProvider;
  readonly idempotencyKey?: string;
  readonly expectedVersion?: string;
}

export interface OperationOptions {
  readonly signal?: AbortSignal;
}

export interface CommandOptions extends OperationOptions {
  readonly idempotencyKey?: string;
}

export interface OUIOperationRuntime {
  readonly queryClient: QueryClient;
  queryKey(queryId: string, input: Readonly<Record<string, unknown>>): QueryKey;
  query<Output = unknown>(
    queryId: string,
    input: Readonly<Record<string, unknown>>,
    options?: OperationOptions,
  ): Promise<Output>;
  command<Output = unknown>(
    commandId: string,
    input: Readonly<Record<string, unknown>>,
    options?: CommandOptions,
  ): Promise<Output>;
  stream<Output = unknown>(
    serviceId: string,
    method: string,
    input: Readonly<Record<string, unknown>>,
    options?: OperationOptions,
  ): AsyncIterable<Output>;
}

export function createOperationRuntime({
  application,
  clients,
  identity,
  session,
  metadata,
  queryClient = new QueryClient(),
}: CreateOperationRuntimeOptions): OUIOperationRuntime {
  const operationHeaders = async (
    idempotencyKey?: string,
    expectedVersion?: string,
  ): Promise<Readonly<Record<string, string>>> => {
    return createOperationHeaders({
      identity,
      session,
      ...(metadata === undefined ? {} : { metadata }),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });
  };

  const resolveClient = (serviceId: string) => {
    const binding = application.serviceBindings[serviceId];
    if (binding === undefined) {
      throw new OUIOperationError({
        kind: "internal",
        operationId: serviceId,
        message: `Service binding ${serviceId} is not declared.`,
        retryable: false,
      });
    }
    return clients.resolve(binding.id, binding.serviceType);
  };

  const runtime: OUIOperationRuntime = {
    queryClient,
    queryKey(queryId, input): QueryKey {
      const query = requireQuery(application, queryId);
      const declaredIdentity = Array.isArray(query.cache.identity)
        ? query.cache.identity.filter(
            (value): value is string => typeof value === "string",
          )
        : Object.keys(input);
      const orderingIdentity = Object.keys(input).filter((name) =>
        /(?:^|_)(?:sort|direction)$/iu.test(name),
      );
      const identity = [...new Set([...declaredIdentity, ...orderingIdentity])];
      return Object.freeze([
        "oui",
        application.id,
        query.id,
        canonicalize(
          Object.fromEntries(
            identity.map((name) => [name, readPath(input, name)]),
          ),
        ),
      ]);
    },
    async query<Output>(
      queryId: string,
      input: Readonly<Record<string, unknown>>,
      options: OperationOptions = {},
    ): Promise<Output> {
      const query = requireQuery(application, queryId);
      const client = resolveClient(query.service);
      const headers = await operationHeaders();

      return queryClient.fetchQuery({
        queryKey: runtime.queryKey(query.id, input),
        staleTime: parseDuration(query.cache.freshFor),
        retryDelay: () => 0,
        retry: (attempt, error) =>
          attempt < 2 && error instanceof OUIOperationError && error.retryable,
        queryFn: async ({ signal }) => {
          const operationSignal = combineSignals(signal, options.signal);
          if (operationSignal.aborted) {
            throw mapOperationError(
              query.id,
              new DOMException("Aborted", "AbortError"),
              operationSignal,
            );
          }
          try {
            return (await client.unary({
              method: query.method,
              input,
              headers,
              signal: operationSignal,
            })) as Output;
          } catch (cause) {
            throw mapOperationError(query.id, cause, operationSignal);
          }
        },
      });
    },
    async command<Output>(
      commandId: string,
      input: Readonly<Record<string, unknown>>,
      options: CommandOptions = {},
    ): Promise<Output> {
      const command = requireCommand(application, commandId);
      validateIdempotency(command, options.idempotencyKey);
      const client = resolveClient(command.service);
      const expectedVersion = readExpectedVersion(input);
      const headers = await operationHeaders(
        options.idempotencyKey,
        expectedVersion,
      );
      const signal = options.signal ?? new AbortController().signal;

      try {
        if (signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const output = (await client.unary({
          method: command.method,
          input,
          headers,
          signal,
        })) as Output;
        await Promise.all(
          command.invalidates.map((queryId) =>
            queryClient.invalidateQueries({
              queryKey: ["oui", application.id, queryId],
            }),
          ),
        );
        return output;
      } catch (cause) {
        throw mapOperationError(command.id, cause, signal);
      }
    },
    async *stream<Output>(
      serviceId: string,
      method: string,
      input: Readonly<Record<string, unknown>>,
      options: OperationOptions = {},
    ): AsyncIterable<Output> {
      const client = resolveClient(serviceId);
      if (client.serverStream === undefined) {
        throw new OUIOperationError({
          kind: "internal",
          operationId: method,
          message: `Generated client ${client.serviceType} does not support server streams.`,
          retryable: false,
        });
      }
      const headers = await operationHeaders();
      const signal = options.signal ?? new AbortController().signal;
      try {
        for await (const output of client.serverStream({
          method,
          input,
          headers,
          signal,
        })) {
          yield output as Output;
        }
      } catch (cause) {
        throw mapOperationError(method, cause, signal);
      }
    },
  };

  return Object.freeze(runtime);
}

export async function createOperationHeaders({
  identity,
  session,
  metadata,
  idempotencyKey,
  expectedVersion,
}: CreateOperationHeadersOptions): Promise<Readonly<Record<string, string>>> {
  const dynamic = (await metadata?.getMetadata()) ?? {};
  return Object.freeze({
    "accept-language": session.locale,
    "x-oui-time-zone": session.timeZone,
    "x-oui-application": identity.applicationId,
    "x-oui-ir-version": identity.irVersion,
    "x-oui-ir-digest": identity.irDigest,
    "x-oui-bff-plan-digest": identity.bffPlanDigest,
    "x-oui-descriptor-digest": identity.descriptorDigest,
    "x-oui-contract-digest": identity.contractDigest,
    "x-oui-runtime-version": identity.runtimeVersion,
    ...(dynamic.accessToken === undefined
      ? {}
      : { authorization: `Bearer ${dynamic.accessToken}` }),
    ...(dynamic.traceparent === undefined
      ? {}
      : { traceparent: dynamic.traceparent }),
    ...(dynamic.tracestate === undefined
      ? {}
      : { tracestate: dynamic.tracestate }),
    ...(dynamic.correlationId === undefined
      ? {}
      : { "x-correlation-id": dynamic.correlationId }),
    ...(dynamic.deadlineMs === undefined
      ? {}
      : { "connect-timeout-ms": String(validateDeadline(dynamic.deadlineMs)) }),
    ...(idempotencyKey === undefined
      ? {}
      : { "idempotency-key": idempotencyKey }),
    ...(expectedVersion === undefined ? {} : { "if-match": expectedVersion }),
  });
}

function readExpectedVersion(
  input: Readonly<Record<string, unknown>>,
): string | undefined {
  const candidate = input.expectedVersion ?? input.expected_version;
  return typeof candidate === "string" && candidate !== ""
    ? candidate
    : undefined;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return typeof current === "object" && current !== null
      ? (current as Readonly<Record<string, unknown>>)[segment]
      : undefined;
  }, value);
}

function validateDeadline(deadlineMs: number): number {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) {
    throw new Error(
      "Operation deadline must be a positive integer in milliseconds.",
    );
  }
  return deadlineMs;
}

function requireQuery(
  application: ApplicationDefinition,
  queryId: string,
): QueryDefinition {
  const query = application.queries[queryId];
  if (query === undefined) {
    throw new OUIOperationError({
      kind: "internal",
      operationId: queryId,
      message: `Query ${queryId} is not declared.`,
      retryable: false,
    });
  }
  return query;
}

function requireCommand(
  application: ApplicationDefinition,
  commandId: string,
): CommandDefinition {
  const command = application.commands[commandId];
  if (command === undefined) {
    throw new OUIOperationError({
      kind: "internal",
      operationId: commandId,
      message: `Command ${commandId} is not declared.`,
      retryable: false,
    });
  }
  return command;
}

function validateIdempotency(
  command: CommandDefinition,
  key: string | undefined,
): void {
  if (command.idempotency === "required" && key === undefined) {
    throw new OUIOperationError({
      kind: "validation",
      operationId: command.id,
      message: `Command ${command.id} requires an idempotency key.`,
      retryable: false,
    });
  }
  if (command.idempotency === "prohibited" && key !== undefined) {
    throw new OUIOperationError({
      kind: "validation",
      operationId: command.id,
      message: `Command ${command.id} prohibits idempotency keys.`,
      retryable: false,
    });
  }
}

function combineSignals(
  querySignal: AbortSignal,
  callerSignal: AbortSignal | undefined,
): AbortSignal {
  return callerSignal === undefined
    ? querySignal
    : AbortSignal.any([querySignal, callerSignal]);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function parseDuration(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }
  const match = /^PT(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value);
  return match === null
    ? 0
    : Number(match[1] ?? 0) * 60_000 + Number(match[2] ?? 0) * 1_000;
}
