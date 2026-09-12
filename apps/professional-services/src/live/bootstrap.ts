import {
  createGeneratedConnectClient,
  type GeneratedConnectUnaryMethod,
} from "@oui/data";
import {
  createProfessionalServicesApplicationComposition,
  type ProfessionalServicesApplicationComposition,
} from "../application";
import {
  professionalServicesContractIdentity,
  verifyProfessionalServicesArtifacts,
} from "../compatibility";
import { createReferenceBrowserClient } from "../generated/ontobff/connect-es/reference_client";

const serviceType =
  "oui.professional_services.v1.ProfessionalServicesFrontendService";

interface ProfessionalServicesBrowserClient {
  getConflictCheck(
    input: unknown,
    options?: BrowserCallOptions,
  ): Promise<unknown>;
  getConflictDecisionContext(
    input: unknown,
    options?: BrowserCallOptions,
  ): Promise<unknown>;
  decideConflictCheck(
    input: unknown,
    options?: BrowserCallOptions,
  ): Promise<unknown>;
}

interface BrowserCallOptions {
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
}

export function bootstrapProfessionalServicesApplication(
  token: string,
): ProfessionalServicesApplicationComposition {
  return composeProfessionalServicesApplication(
    createReferenceBrowserClient(window.location.origin),
    token,
  );
}

export function composeProfessionalServicesApplication(
  generated: ProfessionalServicesBrowserClient,
  token: string,
): ProfessionalServicesApplicationComposition {
  const diagnostics = verifyProfessionalServicesArtifacts();
  if (diagnostics.length > 0) {
    throw new Error(
      `Professional-services artifact admission failed:\n${diagnostics
        .map((diagnostic) => `- ${diagnostic}`)
        .join("\n")}`,
    );
  }
  const client = createGeneratedConnectClient(
    serviceType,
    createProfessionalServicesGeneratedTransport(generated),
  );
  return createProfessionalServicesApplicationComposition({
    client,
    identity: professionalServicesContractIdentity,
    metadata: Object.freeze({
      getMetadata: () => ({
        accessToken: token,
        correlationId: `oui-professional-services-${crypto.randomUUID()}`,
        deadlineMs: 15_000,
      }),
    }),
    session: Object.freeze({
      actor: Object.freeze({
        id: "actor-reviewer",
        displayName: "Conflict Reviewer",
      }),
      tenant: null,
      capabilities: Object.freeze([
        "conflict_check.read",
        "conflict_check.decide",
      ]),
      locale: "en-US",
      timeZone: "UTC",
    }),
  });
}

/**
 * Bind the generated protobuf-ES client to OUI's generic operation runtime.
 * The compiler IR addresses protobuf field names while generated TypeScript
 * uses lowerCamelCase, so both lexical projections remain application-local.
 */
export function createProfessionalServicesGeneratedTransport(
  generated: ProfessionalServicesBrowserClient,
): Readonly<Record<string, GeneratedConnectUnaryMethod>> {
  return Object.freeze({
    [`${serviceType}.GetConflictCheck`]: async (input, options) =>
      toIrOutput(
        await generated.getConflictCheck(toMessageInit(input), options),
      ),
    [`${serviceType}.GetConflictDecisionContext`]: async (input, options) =>
      toIrOutput(
        await generated.getConflictDecisionContext(
          toMessageInit(input),
          options,
        ),
      ),
    [`${serviceType}.DecideConflictCheck`]: async (input, options) =>
      toIrOutput(
        await generated.decideConflictCheck(toMessageInit(input), options),
      ),
  });
}

function toMessageInit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toMessageInit);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [toLowerCamel(key), toMessageInit(entry)]),
  );
}

function toIrOutput(value: unknown): unknown {
  const normalized = toSnakeCase(value);
  if (
    typeof normalized !== "object" ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    return normalized;
  }
  const output = normalized as Readonly<Record<string, unknown>>;
  const outcome =
    typeof output.outcome === "object" && output.outcome !== null
      ? (output.outcome as Readonly<Record<string, unknown>>)
      : undefined;
  if (outcome?.case === "operation") {
    return Object.freeze({ ...output, operation: outcome.value });
  }
  if (outcome?.case === "conflictCheck") {
    return Object.freeze({ ...output, conflict_check: outcome.value });
  }
  return Object.freeze({ ...output });
}

function toSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeCase);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).map(
      ([key, entry]) => [
        key.replace(/[A-Z]/gu, (character) => `_${character.toLowerCase()}`),
        toSnakeCase(entry),
      ],
    ),
  );
}

function toLowerCamel(value: string): string {
  return value.replace(/_([a-z0-9])/gu, (_match, character: string) =>
    character.toUpperCase(),
  );
}
