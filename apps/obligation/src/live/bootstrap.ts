import type { SessionContext } from "@oui/core";
import {
  createGeneratedConnectClient,
  createOperationHeaders,
  type GeneratedConnectClient,
  type OperationMetadataProvider,
} from "@oui/data";
import {
  createObligationApplicationComposition,
  type ObligationApplicationComposition,
} from "../application";
import {
  admitObligationCompatibility,
  type BffCompatibility,
  type ObligationContractIdentity,
} from "../compatibility";
import { createReferenceBrowserClient } from "../generated/ontobff/connect-es/reference_client";

const serviceType = "oui.obligation.v1.ObligationFrontendService";

interface SessionResult {
  readonly actor?: { readonly id: string; readonly displayName: string };
  readonly capabilities: readonly string[];
  readonly locale: string;
  readonly timeZone: string;
}

/**
 * Startup order is the contract: admit the served artifact identity before any
 * operational request, then derive availability from the disclosed session.
 * A stale bundle fails closed rather than executing against a different
 * semantic, generated, or transport contract.
 */
export async function bootstrapObligationApplication(
  token: string,
): Promise<ObligationApplicationComposition> {
  const generated = createReferenceBrowserClient(window.location.origin);
  const compatibility = (await generated.getCompatibility(
    {},
  )) as unknown as BffCompatibility;
  const identity = admitObligationCompatibility(compatibility);

  const metadata: OperationMetadataProvider = Object.freeze({
    getMetadata: () => ({
      accessToken: token,
      correlationId: `oui-obligation-${crypto.randomUUID()}`,
      deadlineMs: 15_000,
    }),
  });

  // OUI's transport adapter over the generated client, so the operation
  // runtime drives every call rather than this module hand-rolling requests.
  //
  // The IR addresses request fields by their Protobuf name (obligation_id)
  // while protobuf-ES message initializers use the generated TypeScript name
  // (obligationId). The conversion is purely lexical, so it is applied
  // generically here rather than transcribed field by field.
  const client: GeneratedConnectClient = createGeneratedConnectClient(
    serviceType,
    generatedTransport(generated),
  );

  const bootstrapSession: SessionContext = {
    actor: null,
    tenant: null,
    capabilities: [],
    locale: navigator.language || "en-US",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
  const sessionResult = (await generated.getSession(
    {},
    { headers: await sessionHeaders(identity, token, bootstrapSession) },
  )) as unknown as SessionResult;

  if (sessionResult.actor === undefined) {
    throw new Error("The BFF did not identify the authenticated actor.");
  }

  const session: SessionContext = Object.freeze({
    actor: {
      id: sessionResult.actor.id,
      displayName: sessionResult.actor.displayName,
    },
    // The compiled session contract does not disclose a tenant identifier.
    // OUI represents that absence explicitly; the BFF still enforces tenant
    // isolation server-side.
    tenant: null,
    capabilities: [...sessionResult.capabilities],
    locale: sessionResult.locale || bootstrapSession.locale,
    timeZone: sessionResult.timeZone || bootstrapSession.timeZone,
  });

  return createObligationApplicationComposition({
    client,
    identity,
    metadata,
    session,
  });
}

/**
 * The bootstrap session call happens before the operation runtime exists, so
 * its headers are built by the same OUI helper the runtime uses afterwards.
 */
async function sessionHeaders(
  identity: ObligationContractIdentity,
  token: string,
  session: SessionContext,
): Promise<Headers> {
  return new Headers(
    await createOperationHeaders({
      identity,
      session,
      metadata: { getMetadata: () => ({ accessToken: token }) },
    }),
  );
}

/** snake_case -> lowerCamelCase, applied through nested objects and arrays. */
/**
 * Every RPC the generated client exposes, addressed the way the operation
 * runtime addresses it.
 *
 * The generated client carries one lowerCamel method per RPC alongside its
 * service descriptor, so the mapping is derivable. Writing it out by hand
 * meant maintaining a per-application list where a missing entry silently
 * broke exactly one operation, which is the defect shape the generated Go
 * side has already been cleared of twice.
 */
function generatedTransport(
  generated: ReturnType<typeof createReferenceBrowserClient>,
): Record<
  string,
  (input: unknown, options?: { headers?: HeadersInit }) => Promise<unknown>
> {
  const transport: Record<
    string,
    (input: unknown, options?: { headers?: HeadersInit }) => Promise<unknown>
  > = {};
  for (const [name, method] of Object.entries(generated)) {
    if (name === "service" || typeof method !== "function") continue;
    const rpc = name.charAt(0).toUpperCase() + name.slice(1);
    transport[`${serviceType}.${rpc}`] = (input, options) =>
      (method as (input: unknown, options?: unknown) => Promise<unknown>)(
        toMessageInit(input),
        options,
      );
  }
  return transport;
}

function toMessageInit(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toMessageInit);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [
        key.replace(/_([a-z0-9])/gu, (_match, character: string) =>
          character.toUpperCase(),
        ),
        toMessageInit(entry),
      ]),
  );
}
