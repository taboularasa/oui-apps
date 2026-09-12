import type { SessionContext } from "@oui/core";
import {
  createOperationHeaders,
  type OperationMetadataProvider,
} from "@oui/data";
import {
  createReferenceApplicationComposition,
  type ReferenceApplicationComposition,
} from "../application";
import {
  createReferenceGeneratedConnectClient,
  referenceServiceType,
} from "./generated-connect-client";
import {
  negotiateReferenceCompatibility,
  ouiClientRelease,
  type BffCompatibility,
  type NegotiatedReferenceContractIdentity,
} from "./compatibility";
import type { ReferenceRuntimeConfig } from "./runtime-config";

interface ReferenceSessionResult {
  readonly actor?: { readonly id: string; readonly displayName: string };
  readonly tenant: null;
  readonly permissions: readonly string[];
  readonly locale: string;
  readonly timeZone: string;
}

const permissionMappings = Object.freeze({
  "items.read": "permission:item.read",
  "items.update": "permission:item.update",
  "decision.read": "permission:proposal.view",
  "decision.decide": "permission:proposal.decide",
  "decision.reject": "permission:proposal.reject",
  "operations.read": "permission:operation.view",
} as const);

export function createReferenceSession(
  result: ReferenceSessionResult,
): SessionContext {
  if (result.actor === undefined) {
    throw new Error(
      "OntoBFF GetSession did not identify the authenticated actor.",
    );
  }
  if (result.locale === "" || result.timeZone === "") {
    throw new Error("OntoBFF GetSession omitted locale or time-zone context.");
  }
  const capabilities = result.permissions.map(
    (permission) =>
      permissionMappings[permission as keyof typeof permissionMappings] ??
      `bff:${permission}`,
  );
  return deepFreeze({
    actor: {
      id: result.actor.id,
      displayName: result.actor.displayName,
    },
    // The released GetSession contract does not disclose a tenant identifier.
    // OUI keeps this explicit and null; OntoBFF still enforces tenant isolation.
    tenant: null,
    capabilities: [...new Set(capabilities)],
    locale: result.locale,
    timeZone: result.timeZone,
  });
}

export function createBootstrapRequestSignal(): AbortSignal {
  return AbortSignal.timeout(10_000);
}

export function admitBootstrapCompatibility(
  compatibility: BffCompatibility,
): NegotiatedReferenceContractIdentity {
  return negotiateReferenceCompatibility(compatibility, ouiClientRelease);
}

export async function bootstrapLiveReferenceApplication(
  config: ReferenceRuntimeConfig,
): Promise<ReferenceApplicationComposition> {
  const client = createReferenceGeneratedConnectClient(config.ontoBffUrl);
  const compatibility = (await client.unary({
    method: `${referenceServiceType}.GetCompatibility`,
    input: {},
    headers: {},
    signal: createBootstrapRequestSignal(),
  })) as BffCompatibility;
  const identity = admitBootstrapCompatibility(compatibility);
  const metadata = createLiveMetadata(config);
  const bootstrapSession: SessionContext = {
    actor: null,
    tenant: null,
    capabilities: [],
    locale: navigator.language || "en-US",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
  const sessionHeaders = await createOperationHeaders({
    identity,
    metadata,
    session: bootstrapSession,
  });
  const sessionResult = (await client.unary({
    method: `${referenceServiceType}.GetSession`,
    input: {},
    headers: sessionHeaders,
    signal: createBootstrapRequestSignal(),
  })) as ReferenceSessionResult;
  const session = createReferenceSession(sessionResult);

  return createReferenceApplicationComposition({
    client,
    identity,
    metadata,
    session,
  });
}

function createLiveMetadata(
  config: ReferenceRuntimeConfig,
): OperationMetadataProvider {
  return Object.freeze({
    getMetadata: () => ({
      ...(config.testToken === undefined
        ? {}
        : { accessToken: config.testToken }),
      traceparent: createTraceparent(),
      tracestate: "oui=reference",
      correlationId: `oui-${crypto.randomUUID()}`,
      deadlineMs: 10_000,
    }),
  });
}

function createTraceparent(): string {
  const trace = crypto.getRandomValues(new Uint8Array(16));
  const parent = crypto.getRandomValues(new Uint8Array(8));
  return `00-${hex(trace)}-${hex(parent)}-01`;
}

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
