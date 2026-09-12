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
import applicationIr from "./generated/compiler/application.ir.json?raw";

/**
 * Capabilities this application realizes. The compiled IR declares what it
 * requires; the runtime refuses to mount if anything required is missing.
 */
export const obligationCapabilities = Object.freeze([
  { id: "interaction.collection", version: "1.0.0" },
  { id: "interaction.detail", version: "1.0.0" },
  { id: "interaction.form", version: "1.0.0" },
  { id: "transport.connect.unary", version: "1.0.0" },
  { id: "presentation.theme.semantic-tokens", version: "1.0.0" },
]);

export interface ObligationApplicationComposition {
  readonly applicationBootstrap: ApplicationBootstrapReady;
  readonly operationRuntime: OUIOperationRuntime;
  readonly extensionCatalog: ExtensionCatalog<OUIRouterExtensionImplementations>;
}

export function createObligationApplicationComposition(options: {
  readonly client: GeneratedConnectClient;
  readonly identity: OperationContractIdentity;
  readonly metadata: OperationMetadataProvider;
  readonly session: SessionContext;
}): ObligationApplicationComposition {
  const applicationBootstrap = createApplication({
    ir: applicationIr,
    runtime: {
      capabilities: obligationCapabilities,
      services: {
        clock: { now: () => new Date() },
        diagnostics: { report: () => undefined },
      },
      session: options.session,
    },
  });
  if (applicationBootstrap.status !== "ready") {
    throw new Error(
      `The compiled obligation application IR failed validation: ${JSON.stringify(
        applicationBootstrap,
      ).slice(0, 800)}`,
    );
  }
  const clients = createConnectClientRegistry();
  clients.register({
    serviceBindingId: "service:obligation",
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
    extensionCatalog: obligationExtensionCatalog,
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

export const obligationExtensionCatalog = extensionRegistry.seal("1.0.0");

function registerInteractionPattern(
  kind: InteractionDefinition["kind"],
  load: () => Promise<OUIInteractionModule>,
): void {
  extensionRegistry.register({
    id: `extension:obligation:${kind}`,
    category: "interaction_pattern",
    capability: { id: `interaction.${kind}`, version: "1.0.0" },
    contract: { id: "oui.interaction-pattern", version: "1.0.0" },
    supportedIr: { major: 1, minimumMinor: 0, maximumMinor: 0 },
    lifecycle: "interaction",
    origin: "core",
    implementation: { load: () => load() },
  });
}
