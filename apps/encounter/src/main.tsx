import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@oui/theme-default/styles.css";
import "@oui/react-aria/styles.css";
import { App } from "./App";
import type { EncounterApplicationComposition } from "./application";
import { bootstrapEncounterApplication } from "./live/bootstrap";
import "./styles.css";

const container = document.querySelector("#root");
if (!(container instanceof HTMLElement)) {
  throw new Error("The encounter application root element was not found.");
}
const root = createRoot(container);

// This entry point is an open demonstration using the backend's seeded demo
// actor. Discard credentials retained by the former sign-in screen so old tabs
// and bookmarked token URLs cannot override the public demo identity.
try {
  window.sessionStorage.removeItem("encounter-workbench.credential");
} catch {
  // Storage is optional; startup does not read credentials from it.
}
const url = new URL(window.location.href);
if (url.searchParams.has("token")) {
  url.searchParams.delete("token");
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
start(root);

/**
 * Land on the first declared navigation entry when the bundle is opened at its
 * base path. The landing target is read from the compiled IR, so the shell
 * names no route of its own.
 */
function enterLandingRoute(composition: EncounterApplicationComposition): void {
  const base = import.meta.env.BASE_URL;
  const relative = window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname.replace(/^\//u, "");
  if (relative !== "" && relative !== "/") {
    return;
  }
  const application = composition.applicationBootstrap.application;
  const landing = application.navigation.items[0]?.route;
  const path =
    landing === undefined ? undefined : application.routes[landing]?.path;
  if (path === undefined || path.includes("{")) {
    return;
  }
  const target = `${base.replace(/\/$/u, "")}${path}${window.location.search}`;
  window.history.replaceState(null, "", target);
}

function start(reactRoot: Root): void {
  reactRoot.render(<Startup message="Checking OntoBFF compatibility" />);
  void bootstrapEncounterApplication("public-demo")
    .then((composition) => {
      enterLandingRoute(composition);
      reactRoot.render(
        <StrictMode>
          <App composition={composition} />
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      reactRoot.render(
        <Startup
          error
          message={
            error instanceof Error
              ? error.message
              : "Startup failed without a diagnostic."
          }
          onRetry={() => start(reactRoot)}
        />,
      );
    });
}

function Startup({
  error = false,
  message,
  onRetry,
}: {
  readonly error?: boolean;
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <main
      className="encounter-startup"
      data-oui-admission={error ? "failed" : "pending"}
    >
      <h1>
        {error ? "Application unavailable" : "Starting the encounter workbench"}
      </h1>
      <div aria-live="polite" role={error ? "alert" : "status"}>
        <pre>{message}</pre>
      </div>
      {onRetry === undefined ? null : (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </main>
  );
}
