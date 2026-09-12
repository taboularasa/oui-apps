import { StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@oui/theme-default/styles.css";
import "@oui/react-aria/styles.css";
import { App } from "./App";
import { bootstrapProfessionalServicesApplication } from "./live/bootstrap";
import "./styles.css";

const container = document.querySelector("#root");
if (!(container instanceof HTMLElement)) {
  throw new Error("The professional-services application root was not found.");
}
const root = createRoot(container);
const credentialKey = "professional-services-conflict-review.credential";
const url = new URL(window.location.href);
const tokenFromUrl = url.searchParams.get("token");
const credential = tokenFromUrl || readStoredCredential();

if (credential !== null && credential !== "") {
  storeCredential(credential);
  if (tokenFromUrl !== null) {
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  start(root, credential);
} else {
  renderCredentialPrompt(root);
}

function renderCredentialPrompt(reactRoot: Root): void {
  reactRoot.render(
    <CredentialPrompt
      onSubmit={(token) => {
        storeCredential(token);
        start(reactRoot, token);
      }}
    />,
  );
}

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
    // Storage is a convenience; per-request server authorization is final.
  }
}

function clearCredential(): void {
  try {
    window.sessionStorage.removeItem(credentialKey);
  } catch {
    // Storage is a convenience; the replacement prompt remains available.
  }
}

function enterDecisionRoute(): void {
  const base = import.meta.env.BASE_URL.replace(/\/$/u, "");
  if (
    window.location.pathname === `${base}/` ||
    window.location.pathname === base
  ) {
    window.history.replaceState(
      null,
      "",
      `${base}/conflict-checks/conflict-check-1/decision`,
    );
  }
}

function start(reactRoot: Root, token: string): void {
  enterDecisionRoute();
  try {
    const composition = bootstrapProfessionalServicesApplication(token);
    reactRoot.render(
      <StrictMode>
        <div className="professional-services-session">
          <div className="professional-services-session-controls">
            <button
              type="button"
              onClick={() => {
                clearCredential();
                renderCredentialPrompt(reactRoot);
              }}
            >
              Use a different credential
            </button>
          </div>
          <App composition={composition} />
        </div>
      </StrictMode>,
    );
  } catch (error) {
    reactRoot.render(
      <main className="professional-services-startup" role="alert">
        <h1>Application unavailable</h1>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </main>,
    );
  }
}

function CredentialPrompt({
  onSubmit,
}: {
  readonly onSubmit: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <main className="professional-services-startup">
      <h1>Conflict review</h1>
      <p>Enter your access credential to review the compiled decision.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value !== "") onSubmit(value);
        }}
      >
        <label>
          Access credential
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
