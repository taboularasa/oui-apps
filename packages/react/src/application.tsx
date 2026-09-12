import { createContext, useContext, type ReactNode } from "react";
import {
  createRuntime,
  parseApplicationIr,
  validateRuntimeCapabilities,
  type ApplicationDefinition,
  type IrDiagnostic,
  type OUIRuntime,
  type RuntimeConfiguration,
  type SessionContext,
} from "@oui/core";

export const applicationProviderOrder = Object.freeze([
  "runtime",
  "application",
  "session",
] as const);

export interface CreateApplicationOptions {
  readonly ir: string | unknown;
  readonly runtime: RuntimeConfiguration;
}

export interface ApplicationBootstrapReady {
  readonly status: "ready";
  readonly application: ApplicationDefinition;
  readonly runtime: OUIRuntime;
  readonly diagnostics: readonly IrDiagnostic[];
}

export interface ApplicationBootstrapFailure {
  readonly status: "failed";
  readonly diagnostics: readonly IrDiagnostic[];
}

export type ApplicationBootstrap =
  ApplicationBootstrapFailure | ApplicationBootstrapReady;

export interface OUIApplicationRootProps {
  readonly bootstrap: ApplicationBootstrap;
  readonly children?: ReactNode;
}

const RuntimeContext = createContext<OUIRuntime | undefined>(undefined);
const ApplicationContext = createContext<ApplicationDefinition | undefined>(
  undefined,
);
const SessionReactContext = createContext<SessionContext | undefined>(
  undefined,
);

export function createApplication(
  options: CreateApplicationOptions,
): ApplicationBootstrap {
  const parsed = parseApplicationIr(options.ir);

  if (!parsed.ok) {
    return Object.freeze({
      status: "failed",
      diagnostics: parsed.diagnostics,
    });
  }

  const runtime = createRuntime(options.runtime);
  const diagnostics = validateRuntimeCapabilities(
    parsed.application.requiredCapabilities,
    runtime,
  );

  diagnostics.forEach((diagnostic) => {
    runtime.services.diagnostics.report(diagnostic);
  });

  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "failed",
      diagnostics,
    });
  }

  return Object.freeze({
    status: "ready",
    application: parsed.application,
    runtime,
    diagnostics: Object.freeze([]),
  });
}

export function OUIApplicationRoot({
  bootstrap,
  children,
}: OUIApplicationRootProps) {
  if (bootstrap.status === "failed") {
    return <StartupDiagnosticSurface diagnostics={bootstrap.diagnostics} />;
  }

  return (
    <RuntimeContext.Provider value={bootstrap.runtime}>
      <ApplicationContext.Provider value={bootstrap.application}>
        <SessionReactContext.Provider value={bootstrap.runtime.session}>
          <div
            data-oui-root=""
            data-provider-order={applicationProviderOrder.join(",")}
          >
            {children ?? <ApplicationReadySurface />}
          </div>
        </SessionReactContext.Provider>
      </ApplicationContext.Provider>
    </RuntimeContext.Provider>
  );
}

export function useOUIRuntime(): OUIRuntime {
  const runtime = useContext(RuntimeContext);

  if (runtime === undefined) {
    throw new Error("useOUIRuntime must be used within OUIApplicationRoot.");
  }

  return runtime;
}

export function useOUIApplication(): ApplicationDefinition {
  const application = useContext(ApplicationContext);

  if (application === undefined) {
    throw new Error(
      "useOUIApplication must be used within OUIApplicationRoot.",
    );
  }

  return application;
}

export function useOUISession(): SessionContext {
  const session = useContext(SessionReactContext);

  if (session === undefined) {
    throw new Error("useOUISession must be used within OUIApplicationRoot.");
  }

  return session;
}

function ApplicationReadySurface() {
  const application = useOUIApplication();
  const session = useOUISession();
  const title =
    application.metadata.name.fallback ??
    application.metadata.name.id ??
    application.id;

  return (
    <main>
      <h1>{title}</h1>
      {session.actor === null ? (
        <p>Not signed in</p>
      ) : (
        <p>Signed in as {session.actor.displayName}</p>
      )}
    </main>
  );
}

function StartupDiagnosticSurface({
  diagnostics,
}: {
  readonly diagnostics: readonly IrDiagnostic[];
}) {
  return (
    <main data-oui-startup-failure="">
      <h1>Application unavailable</h1>
      <div role="alert">
        <p>OUI could not initialize this application.</p>
        <ul>
          {diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.code}:${diagnostic.irPath}:${String(index)}`}
            >
              <code>{diagnostic.code}</code>: {diagnostic.message}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
