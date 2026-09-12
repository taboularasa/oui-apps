import {
  createExtensionRegistry,
  type ExtensionCatalog,
  type InteractionDefinition,
  type SessionContext,
} from "@oui/core";
import {
  createConnectClientRegistry,
  createOperationRuntime,
  type GeneratedConnectClient,
  type OUIOperationRuntime,
  type OperationContractIdentity,
  type OperationMetadataProvider,
} from "@oui/data";
import { createApplication, type ApplicationBootstrapReady } from "@oui/react";
import type {
  OUIInteractionModule,
  OUIRouterExtensionImplementations,
} from "@oui/router";
import applicationIr from "../../../fixtures/reference/application.ir.json?raw";

export const referenceCapabilities = Object.freeze([
  { id: "interaction.collection", version: "1.0.0" },
  { id: "interaction.detail", version: "1.0.0" },
  { id: "interaction.form", version: "1.0.0" },
  { id: "interaction.decision", version: "1.0.0" },
  { id: "transport.connect.unary", version: "1.0.0" },
  { id: "transport.connect.server-stream", version: "1.0.0" },
  { id: "presentation.theme.semantic-tokens", version: "1.0.0" },
]);

export interface ReferenceApplicationComposition {
  readonly applicationBootstrap: ApplicationBootstrapReady;
  readonly operationRuntime: OUIOperationRuntime;
  readonly extensionCatalog: ExtensionCatalog<OUIRouterExtensionImplementations>;
}

export function createReferenceApplicationComposition(options: {
  readonly client: GeneratedConnectClient;
  readonly identity: OperationContractIdentity;
  readonly metadata: OperationMetadataProvider;
  readonly session: SessionContext;
}): ReferenceApplicationComposition {
  const applicationBootstrap = createApplication({
    ir: applicationIr,
    runtime: {
      capabilities: referenceCapabilities,
      services: {
        clock: { now: () => new Date() },
        diagnostics: { report: () => undefined },
      },
      session: options.session,
    },
  });
  if (applicationBootstrap.status !== "ready") {
    throw new Error(
      "The digest-bound reference application IR failed validation.",
    );
  }
  const clients = createConnectClientRegistry();
  clients.register({
    serviceBindingId: "service:reference",
    client: options.client,
  });
  const operationRuntime = createOperationRuntime({
    application: applicationBootstrap.application,
    clients,
    identity: options.identity,
    metadata: options.metadata,
    session: applicationBootstrap.runtime.session,
  });
  return Object.freeze({
    applicationBootstrap,
    operationRuntime,
    extensionCatalog: referenceExtensionCatalog,
  });
}

const extensionRegistry =
  createExtensionRegistry<OUIRouterExtensionImplementations>();

registerInteractionPattern(
  "collection",
  () => import("./interactions/collection"),
);
registerInteractionPattern("detail", () => import("./interactions/detail"));
registerInteractionPattern("form", () => import("./interactions/form"));
registerInteractionPattern("decision", () => import("./interactions/decision"));

export const referenceExtensionCatalog = extensionRegistry.seal("1.0.0");

function registerInteractionPattern(
  kind: InteractionDefinition["kind"],
  load: () => Promise<OUIInteractionModule>,
): void {
  extensionRegistry.register({
    id: `extension:reference:${kind}`,
    category: "interaction_pattern",
    capability: { id: `interaction.${kind}`, version: "1.0.0" },
    contract: { id: "oui.interaction-pattern", version: "1.0.0" },
    supportedIr: { major: 1, minimumMinor: 0, maximumMinor: 0 },
    lifecycle: "interaction",
    origin: "core",
    implementation: { load: () => load() },
  });
}
