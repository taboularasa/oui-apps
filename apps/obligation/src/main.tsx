import { StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@oui/theme-default/styles.css";
import "@oui/react-aria/styles.css";
import { App } from "./App";
import type { ObligationApplicationComposition } from "./application";
import { bootstrapObligationApplication } from "./live/bootstrap";
import "./styles.css";

const container = document.querySelector("#root");
if (!(container instanceof HTMLElement)) {
  throw new Error("The obligation application root element was not found.");
}
const root = createRoot(container);

const credentialKey = "obligation-register.credential";

/**
 * The credential is kept for the tab's lifetime so a deep link or a reload
 * stays signed in. Navigating between routes drops the query string, and a
 * demo that signs the actor out on every reload is not usable.
 */
function readStoredCredential(): string | null {
  try {
    return window.sessionStorage.getItem(credentialKey);
  } catch {
    return null;
  }
}

function storeCredential(token: string): void {
  try {
    window.sessionStorage.setItem(credentialKey, token);
  } catch {
    // A blocked storage partition only costs the convenience, not the session.
  }
}

const url = new URL(window.location.href);
const tokenFromUrl = url.searchParams.get("token");
const credential =
  tokenFromUrl !== null && tokenFromUrl !== ""
    ? tokenFromUrl
    : readStoredCredential();

if (credential !== null && credential !== "") {
  storeCredential(credential);
  // Keep the credential out of the address bar and out of shared links.
  if (tokenFromUrl !== null) {
    url.searchParams.delete("token");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  start(root, credential);
} else {
  root.render(
    <CredentialPrompt
      onSubmit={(token) => {
        storeCredential(token);
        start(root, token);
      }}
    />,
  );
}

/**
 * Land on the first declared navigation entry when the bundle is opened at its
 * base path. The landing target is read from the compiled IR, so the shell
 * names no route of its own.
 */
function enterLandingRoute(
  composition: ObligationApplicationComposition,
): void {
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

function start(reactRoot: Root, token: string): void {
  reactRoot.render(<Startup message="Checking OntoBFF compatibility" />);
  void bootstrapObligationApplication(token)
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
          onRetry={(retryToken) => start(reactRoot, retryToken)}
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
  readonly onRetry?: (token: string) => void;
}) {
  return (
    <main
      className="obligation-startup"
      data-oui-admission={error ? "failed" : "pending"}
    >
      <h1>
        {error
          ? "Application unavailable"
          : "Starting the obligation workbench"}
      </h1>
      <div aria-live="polite" role={error ? "alert" : "status"}>
        <pre>{message}</pre>
      </div>
      {onRetry === undefined ? null : (
        <CredentialForm
          onSubmit={(token) => {
            storeCredential(token);
            onRetry(token);
          }}
        />
      )}
    </main>
  );
}

function CredentialPrompt({
  onSubmit,
}: {
  readonly onSubmit: (token: string) => void;
}) {
  return (
    <main className="obligation-startup">
      <h1>Obligation workbench</h1>
      <p>
        A domain-neutral application compiled from shared ontology concepts and
        generated into a Go service. Enter the demo credential to sign in.
      </p>
      <CredentialForm onSubmit={onSubmit} />
      <p>
        The browser conformance harness is at <a href="uat.html">uat.html</a>.
      </p>
    </main>
  );
}

function CredentialForm({
  onSubmit,
}: {
  readonly onSubmit: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (value !== "") onSubmit(value);
      }}
    >
      <label>
        Demo credential
        <br />
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit">Sign in</button>
    </form>
  );
}
