import type { SessionContext } from "@oui/core";
import {
  createGeneratedConnectClient,
  createOperationHeaders,
  type GeneratedConnectClient,
  type OperationMetadataProvider,
} from "@oui/data";
import {
  createEncounterApplicationComposition,
  type EncounterApplicationComposition,
} from "../application";
import {
  admitEncounterCompatibility,
  type BffCompatibility,
  type EncounterContractIdentity,
} from "../compatibility";
import { createReferenceBrowserClient } from "../generated/ontobff/connect-es/reference_client";

const serviceType = "oui.encounter.v1.EncounterFrontendService";

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
export async function bootstrapEncounterApplication(
  token: string,
): Promise<EncounterApplicationComposition> {
  const generated = createReferenceBrowserClient(window.location.origin);
  const compatibility = (await generated.getCompatibility(
    {},
  )) as unknown as BffCompatibility;
  const identity = admitEncounterCompatibility(compatibility);

  const metadata: OperationMetadataProvider = Object.freeze({
    getMetadata: () => ({
      accessToken: token,
      correlationId: `oui-encounter-${crypto.randomUUID()}`,
      deadlineMs: 15_000,
    }),
  });

  // OUI's transport adapter over the generated client, so the operation
  // runtime drives every call rather than this module hand-rolling requests.
  //
  // The IR addresses request fields by their Protobuf name (encounter_id)
  // while protobuf-ES message initializers use the generated TypeScript name
  // (encounterId). The conversion is purely lexical, so it is applied
  // generically here rather than transcribed field by field.
  const client: GeneratedConnectClient = createGeneratedConnectClient(
    serviceType,
    {
      [`${serviceType}.GetSession`]: (input, options) =>
        generated.getSession(toMessageInit(input) as never, options),
      [`${serviceType}.ListEncounters`]: (input, options) =>
        generated.listEncounters(toMessageInit(input) as never, options),
      [`${serviceType}.GetEncounter`]: (input, options) =>
        generated.getEncounter(toMessageInit(input) as never, options),
      [`${serviceType}.TransitionEncounter`]: (input, options) =>
        generated.transitionEncounter(toMessageInit(input) as never, options),
      [`${serviceType}.GetCompatibility`]: (input, options) =>
        generated.getCompatibility(toMessageInit(input) as never, options),
      [`${serviceType}.CreateEncounter`]: (input, options) =>
        generated.createEncounter(toMessageInit(input) as never, options),
      [`${serviceType}.DeleteEncounter`]: (input, options) =>
        generated.deleteEncounter(toMessageInit(input) as never, options),
      [`${serviceType}.ListCustomers`]: (input, options) =>
        generated.listCustomers(toMessageInit(input) as never, options),
      [`${serviceType}.GetCustomer`]: (input, options) =>
        generated.getCustomer(toMessageInit(input) as never, options),
    },
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

  return createEncounterApplicationComposition({
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
  identity: EncounterContractIdentity,
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
