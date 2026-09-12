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
import { applicationIr } from "./generated/compiler/oui-application.generated";

export const professionalServicesCapabilities = Object.freeze([
  { id: "interaction.decision", version: "1.0.0" },
  { id: "interaction.detail", version: "1.0.0" },
  { id: "transport.connect.unary", version: "1.0.0" },
  { id: "presentation.theme.semantic-tokens", version: "1.0.0" },
]);

export interface ProfessionalServicesApplicationComposition {
  readonly applicationBootstrap: ApplicationBootstrapReady;
  readonly operationRuntime: OUIOperationRuntime;
  readonly extensionCatalog: ExtensionCatalog<OUIRouterExtensionImplementations>;
}

export function createProfessionalServicesApplicationComposition(options: {
  readonly client: GeneratedConnectClient;
  readonly identity: OperationContractIdentity;
  readonly metadata: OperationMetadataProvider;
  readonly session: SessionContext;
}): ProfessionalServicesApplicationComposition {
  const applicationBootstrap = createApplication({
    ir: applicationIr,
    runtime: {
      capabilities: professionalServicesCapabilities,
      services: {
        clock: { now: () => new Date() },
        diagnostics: { report: () => undefined },
      },
      session: options.session,
    },
  });
  if (applicationBootstrap.status !== "ready") {
    throw new Error(
      `The compiled professional-services application IR failed validation: ${JSON.stringify(
        applicationBootstrap,
      ).slice(0, 800)}`,
    );
  }

  const clients = createConnectClientRegistry();
  clients.register({
    serviceBindingId: "service:professional-services",
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
    extensionCatalog: professionalServicesExtensionCatalog,
  });
}

const extensionRegistry =
  createExtensionRegistry<OUIRouterExtensionImplementations>();

registerInteractionPattern("detail", () => import("./interactions/detail"));
registerInteractionPattern("decision", () => import("./interactions/decision"));

export const professionalServicesExtensionCatalog =
  extensionRegistry.seal("1.0.0");

function registerInteractionPattern(
  kind: InteractionDefinition["kind"],
  load: () => Promise<OUIInteractionModule>,
): void {
  extensionRegistry.register({
    id: `extension:professional-services:${kind}`,
    category: "interaction_pattern",
    capability: { id: `interaction.${kind}`, version: "1.0.0" },
    contract: { id: "oui.interaction-pattern", version: "1.0.0" },
    supportedIr: { major: 1, minimumMinor: 0, maximumMinor: 0 },
    lifecycle: "interaction",
    origin: "core",
    implementation: { load: () => load() },
  });
}
