import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@oui/theme-default/styles.css";
import "@oui/react-aria/styles.css";
import { App } from "./App";
import { bootstrapLiveReferenceApplication } from "./live/bootstrap";
import { loadReferenceRuntimeConfig } from "./live/runtime-config";
import "./styles.css";

const root = document.querySelector("#root");

if (!(root instanceof HTMLElement)) {
  throw new Error("OUI reference application root element was not found.");
}

const reactRoot = createRoot(root);
reactRoot.render(
  <LiveStartupStatus message="Checking OntoBFF compatibility" />,
);

void loadReferenceRuntimeConfig()
  .then(bootstrapLiveReferenceApplication)
  .then((composition) => {
    reactRoot.render(
      <StrictMode>
        <App composition={composition} />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    reactRoot.render(
      <LiveStartupStatus
        error
        message={
          error instanceof Error
            ? error.message
            : "Live OntoBFF startup failed without a diagnostic."
        }
      />,
    );
  });

function LiveStartupStatus({
  error = false,
  message,
}: {
  readonly error?: boolean;
  readonly message: string;
}) {
  return (
    <main data-oui-live-admission={error ? "failed" : "pending"}>
      <h1>{error ? "Application unavailable" : "Starting application"}</h1>
      <div aria-live="polite" role={error ? "alert" : "status"}>
        <pre>{message}</pre>
      </div>
    </main>
  );
}
