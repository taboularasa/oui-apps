import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import axe from "axe-core";
import {
  OUIApplicationRoot,
  OUIThemeProvider,
  applicationProviderOrder,
  createApplication,
  useOUIApplication,
  useOUIRuntime,
  useOUISession,
} from "@oui/react";
import { Button, Field, Inline, Link } from "@oui/react-aria";
import {
  OUIRouterProvider,
  createMemoryHistory,
  createOUIRouter,
} from "@oui/router";
import {
  TestConnectClient,
  createConnectClientRegistry,
  createOperationRuntime,
  type TestConnectHandler,
} from "@oui/data";
import { CollectionPattern } from "@oui/resource-patterns";
import { dawnTheme } from "@oui/theme-default";
import { App } from "./App";
import {
  PrimitiveShowcase,
  type PrimitiveShowcaseState,
} from "./PrimitiveShowcase";
import {
  applicationBootstrap,
  referenceCapabilities,
  referenceExtensionCatalog,
  referenceOperationRuntime,
  referenceTestComposition,
  referenceTestSession,
} from "./application.testing";
import { createReferenceApplicationComposition } from "./application";
import applicationIr from "../../../fixtures/reference/application.ir.json?raw";
import { referenceContractIdentity } from "./live/compatibility";
import "@oui/theme-default/styles.css";
import "@oui/react-aria/styles.css";
import "./styles.css";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("reference application", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("initializes the valid fixture and renders the application root", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(() => {
      root.render(<App composition={referenceTestComposition} />);
    });

    expect(document.querySelector("h1")?.textContent).toBe("Page not found");
    expect(document.querySelector("[data-oui-root]")).not.toBeNull();
    expect(
      document
        .querySelector("[data-oui-root]")
        ?.getAttribute("data-provider-order"),
    ).toBe(applicationProviderOrder.join(","));

    await act(() => {
      root.unmount();
    });
  });

  it("switches theme and density without resetting controlled state", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(() => {
      root.render(<App composition={referenceTestComposition} />);
    });

    const selections = host.querySelectorAll<HTMLButtonElement>(
      ".oui-selection-trigger",
    );
    const theme = selections.item(0);
    const density = selections.item(1);
    const draft = host.querySelector<HTMLInputElement>(".oui-field input");
    const themeRoot = host.querySelector<HTMLElement>("[data-oui-theme]");

    if (draft === null || themeRoot === null) {
      throw new Error("Expected the appearance controls to render.");
    }

    await act(() => {
      setNativeValue(draft, "preserve me");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const lightCanvas = themeRoot.style.getPropertyValue(
      "--oui-color-surface-canvas",
    );

    await act(async () => {
      await userEvent.click(theme);
      const midnight = document.querySelector<HTMLElement>(
        '[role="option"][data-key="theme:midnight"]',
      );
      if (midnight === null) {
        throw new Error("Expected the midnight theme option to open.");
      }
      await userEvent.click(midnight);
      await userEvent.click(density);
      const compact = document.querySelector<HTMLElement>(
        '[role="option"][data-key="compact"]',
      );
      if (compact === null) {
        throw new Error("Expected the compact density option to open.");
      }
      await userEvent.click(compact);
    });

    expect(themeRoot.dataset.ouiTheme).toBe("theme:midnight");
    expect(themeRoot.dataset.ouiDensity).toBe("compact");
    expect(
      themeRoot.style.getPropertyValue("--oui-color-surface-canvas"),
    ).not.toBe(lightCanvas);
    expect(
      themeRoot.style.getPropertyValue("--oui-density-control-height"),
    ).toBe("2rem");
    expect(draft.value).toBe("preserve me");

    await act(() => {
      root.unmount();
    });
  });

  it("renders the application shell landmarks and global feedback region", async () => {
    const { host, root } = await render(
      <App composition={referenceTestComposition} />,
    );

    expect(host.querySelector("header")).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(host.querySelector("main#oui-main-content")).not.toBeNull();
    expect(
      host.querySelector('aside[aria-label="Global feedback"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain("Route ready");

    await act(() => {
      root.unmount();
    });
  });

  it("keeps rendered application hrefs within the configured base path", async () => {
    const history = createMemoryHistory({ initialEntries: ["/uat/items"] });
    const { host, root } = await render(
      <App
        basePath="/uat/"
        composition={referenceTestComposition}
        history={history}
      />,
    );
    await waitForText(host, "Confirm permit status");

    const home = host.querySelector<HTMLAnchorElement>(
      '[aria-label="Reference workspace home"]',
    );
    const items = Array.from(
      host.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Primary"] a'),
    ).find((candidate) => candidate.textContent === "Items");
    const resource = Array.from(
      host.querySelectorAll<HTMLAnchorElement>("main a"),
    ).find((candidate) => candidate.textContent === "Confirm permit status");

    expect(home?.getAttribute("href")).toBe("/uat/");
    expect(items?.getAttribute("href")).toBe("/uat/items");
    expect(resource?.getAttribute("href")).toBe("/uat/items/item%3A44");

    await act(() => {
      root.unmount();
    });
  });

  it("opens a nested route directly and resolves its lazy interaction", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/items/item%3A42/edit"],
    });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );

    expect(
      host.querySelector('[aria-label="Route loading status"]'),
    ).not.toBeNull();
    await waitForText(host, "Edit item");

    expect(host.querySelector("h1")?.textContent).toBe("Edit item");
    expect(
      host.querySelector('[aria-label="Route parameters"]')?.textContent,
    ).toContain('"itemId":"item:42"');
    expect(host.querySelector("#oui-field-title input")).not.toBeNull();
    expect(host.textContent).toContain("No unsaved changes");

    await act(() => {
      root.unmount();
    });
  });

  it("supports keyboard-only form correction across local and BFF validation", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/items/item%3A42/edit"],
    });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );
    await waitForText(host, "No unsaved changes");

    const title = host.querySelector<HTMLInputElement>(
      "#oui-field-title input",
    );
    const save = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => candidate.textContent === "Save");
    if (title === null || save === undefined) {
      throw new Error("Expected the generated edit form controls.");
    }

    await act(async () => {
      title.focus();
      await userEvent.keyboard("{Home}{Shift>}{End}{/Shift}{Backspace}");
    });
    await act(async () => {
      await tabUntil(save);
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Enter a title.");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Form errors",
    );

    await act(async () => {
      await userEvent.tab();
      await userEvent.tab();
      await userEvent.keyboard("Rejected title");
      await tabUntil(save);
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Choose another title.");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Form errors",
    );

    await act(async () => {
      await userEvent.tab();
      await userEvent.tab();
      await userEvent.keyboard(
        "{Home}{Shift>}{End}{/Shift}{Backspace}Service appointment",
      );
      await tabUntil(save);
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Changes saved");
    expect(host.textContent).not.toContain("Choose another title.");

    await act(() => {
      root.unmount();
    });
  });

  it("uses the advanced resource version for a second save in the mounted form", async () => {
    const expectedVersions: unknown[] = [];
    let item = {
      id: "item:42",
      version: "version:42",
      title: "Replace compressor filter",
      status: "open",
      owner: "Reference actor",
      dueAt: "2026-08-20T14:00:00Z",
      history: [],
    };
    const client = new TestConnectClient(
      "oui.reference.v1.ReferenceFrontendService",
      {
        "oui.reference.v1.ReferenceFrontendService.GetItem": () => ({ item }),
        "oui.reference.v1.ReferenceFrontendService.UpdateItem": ({ input }) => {
          const request = input as {
            readonly expected_version?: unknown;
            readonly changes?: Readonly<Record<string, unknown>>;
          };
          expectedVersions.push(request.expected_version);
          item = {
            ...item,
            ...request.changes,
            version: `version:${43 + expectedVersions.length - 1}`,
          };
          return { item, audit_id: `audit:update:${expectedVersions.length}` };
        },
      },
    );
    const composition = createReferenceApplicationComposition({
      client,
      identity: referenceContractIdentity,
      metadata: { getMetadata: () => ({ deadlineMs: 5_000 }) },
      session: referenceTestSession,
    });
    const history = createMemoryHistory({
      initialEntries: ["/items/item%3A42/edit"],
    });
    const { host, root } = await render(
      <App composition={composition} history={history} />,
    );
    await waitForText(host, "No unsaved changes");

    const title = host.querySelector<HTMLInputElement>(
      "#oui-field-title input",
    );
    const save = findButton(host, "Save");
    if (title === null || save === undefined) {
      throw new Error("Expected the generated edit form controls.");
    }

    for (const nextTitle of ["First save", "Second save"]) {
      const expectedRequestCount = expectedVersions.length + 1;
      await act(async () => {
        title.focus();
        await userEvent.keyboard(
          `{Home}{Shift>}{End}{/Shift}{Backspace}${nextTitle}`,
        );
        await userEvent.click(save);
      });
      await waitForRequestCount(expectedVersions, expectedRequestCount);
    }

    expect(expectedVersions).toEqual(["version:42", "version:43"]);

    await act(() => {
      root.unmount();
    });
  });

  it("navigates through generated entries without losing route identifiers", async () => {
    const history = createMemoryHistory({ initialEntries: ["/unknown"] });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );
    const itemsLink = Array.from(
      host.querySelectorAll<HTMLAnchorElement>("a"),
    ).find((candidate) => candidate.textContent === "Items");
    if (itemsLink === undefined) {
      throw new Error("Expected the generated Items navigation entry.");
    }

    await act(async () => {
      await userEvent.click(itemsLink);
    });
    await waitForText(host, "Confirm permit status");

    expect(history.location.pathname).toBe("/items");
    expect(host.querySelector("h1")?.textContent).toBe("Items");
    expect(
      host.querySelector('table[aria-label="Items collection"]'),
    ).not.toBeNull();
    expect(
      Array.from(host.querySelectorAll("th")).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["Select", "Title", "Status", "Owner", "Due"]);
    expect(collectionItemLabels(host)).toEqual([
      "Confirm permit status",
      "Inspect rooftop unit",
    ]);
    const collectionControls = host.querySelector<HTMLElement>(
      '[aria-label="Collection controls"]',
    );
    const sortTrigger = Array.from(
      collectionControls?.querySelectorAll<HTMLButtonElement>(
        ".oui-selection-trigger",
      ) ?? [],
    ).find((trigger) => trigger.textContent?.includes("Title") === true);
    expect(sortTrigger?.textContent).toContain("Title");
    expect(findButton(host, "Ascending")?.ariaLabel).toBe("Sort ascending");

    if (sortTrigger === undefined || sortTrigger === null) {
      throw new Error("Expected the generated collection sort control.");
    }
    await act(async () => {
      await userEvent.click(sortTrigger);
    });
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Title", "Status"]);

    await act(() => {
      root.unmount();
    });
  });

  it("operates collection and detail semantics with the keyboard", async () => {
    const history = createMemoryHistory({ initialEntries: ["/items"] });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );
    await waitForText(host, "Confirm permit status");

    const firstSelection = host.querySelector<HTMLInputElement>(
      'table input[type="checkbox"]',
    );
    const nextPage = findButton(host, "Next page");
    if (firstSelection === null || nextPage === undefined) {
      throw new Error("Expected collection selection and pagination controls.");
    }
    await act(async () => {
      firstSelection.focus();
      await userEvent.keyboard(" ");
    });
    expect(firstSelection.checked).toBe(true);

    await act(async () => {
      nextPage.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Replace compressor filter");
    expect(history.location.search).toContain("page=page%3A2");

    const previousPage = findButton(host, "Previous page");
    if (previousPage === undefined) {
      throw new Error("Expected the previous-page control.");
    }
    await act(async () => {
      previousPage.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Confirm permit status");

    const searchInput = host.querySelector<HTMLInputElement>(
      '[aria-label="Collection controls"] input[type="text"]',
    );
    const applyFilters = findButton(host, "Apply filters");
    if (searchInput === null || applyFilters === undefined) {
      throw new Error("Expected declared collection filters.");
    }
    await act(async () => {
      searchInput.focus();
      await userEvent.keyboard("compressor");
      await userEvent.tab();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Replace compressor filter");
    expect(history.location.search).toContain("query=compressor");

    const direction = findButton(host, "Ascending");
    if (direction === undefined) {
      throw new Error("Expected the declared sorting direction.");
    }
    await act(async () => {
      direction.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForLocationSearch(history, "direction=descending");

    const itemLink = Array.from(
      host.querySelectorAll<HTMLAnchorElement>("a"),
    ).find(
      (candidate) => candidate.textContent === "Replace compressor filter",
    );
    if (itemLink === undefined) {
      throw new Error("Expected the declared collection item route.");
    }
    await act(async () => {
      itemLink.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Work order created");

    expect(history.location.pathname).toBe("/items/item%3A42");
    expect(host.querySelector("h1")?.textContent).toBe(
      "Replace compressor filter",
    );
    expect(
      host.querySelector('section[aria-label="Attributes"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('section[aria-label="Relationships"]'),
    ).not.toBeNull();
    expect(host.querySelector('section[aria-label="History"]')).not.toBeNull();
    expect(host.textContent).toContain("Reference actor");

    await act(() => {
      root.unmount();
    });
  });

  it("preserves collection semantics across list and virtualized renderings", async () => {
    if (applicationBootstrap.status !== "ready") {
      throw new Error("Expected the reference application to initialize.");
    }
    const readyApplication = applicationBootstrap;
    const interaction =
      readyApplication.application.interactions["interaction:item-collection"];
    if (interaction === undefined) {
      throw new Error("Expected the reference collection interaction.");
    }
    const renderCollection = (virtualize: boolean) => (
      <OUIThemeProvider density="comfortable" theme={dawnTheme}>
        <CollectionPattern
          application={readyApplication.application}
          interaction={interaction}
          onNavigate={() => undefined}
          onSearchChange={() => undefined}
          operationRuntime={referenceOperationRuntime}
          parameters={{}}
          search={{
            query: "compressor",
            status: [],
            page: "",
            sort: "title",
            direction: "ascending",
          }}
          variant="list"
          virtualize={virtualize}
        />
      </OUIThemeProvider>
    );
    const { host, root } = await render(renderCollection(false));
    await waitForText(host, "Replace compressor filter");

    expect(
      host.querySelector('ul[aria-label="Items collection"]'),
    ).not.toBeNull();
    expect(collectionItemLabels(host)).toContain("Replace compressor filter");

    await act(() => {
      root.render(renderCollection(true));
    });
    await waitForText(host, "Replace compressor filter");
    expect(
      host.querySelector('[role="list"][aria-label="Items collection"]'),
    ).not.toBeNull();
    expect(collectionItemLabels(host)).toContain("Replace compressor filter");

    await act(() => {
      root.unmount();
    });
  });

  it("completes an evidence-backed decision with keyboard-only confirmation", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/proposals/proposal%3A42/decision"],
    });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );
    await waitForText(host, "Compressor winding is open");

    expect(
      host.querySelector('section[aria-label="Decision authority"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('section[aria-label="Policy explanation"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('section[aria-label="Required evidence"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain(
      "$4,850 including equipment, labor, and commissioning.",
    );
    const chooseReject = findButton(host, "Choose Reject");
    const reviewed = host.querySelector<HTMLInputElement>(
      '[aria-label="Required evidence"] input[type="checkbox"]',
    );
    if (chooseReject === undefined || reviewed === null) {
      throw new Error("Expected evidence review and decision alternatives.");
    }
    expect(chooseReject.disabled).toBe(true);

    await act(async () => {
      reviewed.focus();
      await userEvent.keyboard(" ");
      chooseReject.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "A reason is required for this outcome.");

    const reason = host.querySelector<HTMLInputElement>(
      '[aria-label="Selected outcome"] input',
    );
    const continueReject = findButton(host, "Continue with Reject");
    if (reason === null || continueReject === undefined) {
      throw new Error("Expected the rejection reason and continue action.");
    }
    expect(continueReject.disabled).toBe(true);
    await act(async () => {
      reason.focus();
      await userEvent.keyboard("Estimate exceeds the approved allowance");
      continueReject.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Confirm this decision. It cannot be undone.");
    expect(document.activeElement?.getAttribute("role")).toBe("alertdialog");

    const confirm = findButton(host, "Confirm Reject");
    if (confirm === undefined) {
      throw new Error("Expected the declared confirmation action.");
    }
    await act(async () => {
      await userEvent.tab();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Decision recorded");

    const decisionOutcome = host.querySelector<HTMLElement>(
      'section[aria-label="Decision outcome"]',
    );
    expect(decisionOutcome).not.toBeNull();
    if (decisionOutcome === null) {
      throw new Error("Expected the recorded decision outcome.");
    }
    expect(host.textContent).toContain("Reference actor");
    expect(definitionValue(decisionOutcome, "Decided at")).toBe("Not provided");
    expect(host.textContent).toContain("rejected");

    await act(() => {
      root.unmount();
    });
  });

  it("renders unsupported update fields read-only", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/items/item%3A42/edit"],
    });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );
    await waitForText(host, "No unsaved changes");

    expect(
      host.querySelector<HTMLInputElement>("#oui-field-title input")?.readOnly,
    ).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>("#oui-field-status button")
        ?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>("#oui-field-owner button")
        ?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>("#oui-field-dueAt input")?.readOnly,
    ).toBe(true);

    await act(() => {
      root.unmount();
    });
  });

  it("recovers from a concurrent stale-state decision", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/proposals/proposal%3A42/decision"],
    });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );
    await waitForText(host, "Compressor winding is open");

    const reviewed = host.querySelector<HTMLInputElement>(
      '[aria-label="Required evidence"] input[type="checkbox"]',
    );
    const chooseReject = findButton(host, "Choose Reject");
    if (reviewed === null || chooseReject === undefined) {
      throw new Error("Expected the decision review controls.");
    }
    await act(async () => {
      reviewed.focus();
      await userEvent.keyboard(" ");
      chooseReject.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "A reason is required for this outcome.");

    const reason = host.querySelector<HTMLInputElement>(
      '[aria-label="Selected outcome"] input',
    );
    const continueReject = findButton(host, "Continue with Reject");
    if (reason === null || continueReject === undefined) {
      throw new Error("Expected the stale-decision controls.");
    }
    await act(async () => {
      reason.focus();
      await userEvent.keyboard("simulate stale");
      continueReject.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Confirm this decision. It cannot be undone.");
    await act(async () => {
      await userEvent.tab();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "changed or was decided by someone else");

    const refresh = findButton(host, "Refresh decision context");
    if (refresh === undefined) {
      throw new Error("Expected the conflict recovery action.");
    }
    await act(async () => {
      refresh.focus();
      await userEvent.keyboard("{Enter}");
    });
    await waitForText(host, "Review the required evidence before choosing");
    expect(findButton(host, "Choose Reject")?.disabled).toBe(true);

    await act(() => {
      root.unmount();
    });
  });

  it("renders the route error primitive for invalid strict search state", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/proposals/proposal%3A42/decision?unexpected=value"],
    });
    const { host, root } = await render(
      <App composition={referenceTestComposition} history={history} />,
    );

    await waitForText(host, "does not declare search parameter unexpected");

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain("This route could not be loaded");

    await act(() => {
      root.unmount();
    });
  });

  it("renders an unavailable primitive when route permissions are absent", async () => {
    if (applicationBootstrap.status !== "ready") {
      throw new Error("Expected the reference application to initialize.");
    }
    const runtime = createOUIRouter({
      application: applicationBootstrap.application,
      extensions: referenceExtensionCatalog,
      history: createMemoryHistory({
        initialEntries: ["/proposals/proposal%3A42/decision"],
      }),
      session: {
        ...applicationBootstrap.runtime.session,
        capabilities: [],
      },
    });
    const { host, root } = await render(
      <OUIThemeProvider density="comfortable" theme={dawnTheme}>
        <OUIRouterProvider runtime={runtime} />
      </OUIThemeProvider>,
    );

    await waitForText(
      host,
      "This interaction is unavailable for the current account.",
    );
    expect(host.querySelector('[role="status"]')).not.toBeNull();

    await act(() => {
      root.unmount();
    });
  });

  it("covers operation loading and success in a real browser", async () => {
    let complete:
      ((value: { readonly items: readonly unknown[] }) => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const runtime = createBrowserOperationRuntime({
      "oui.reference.v1.ReferenceFrontendService.ListItems": () => {
        markStarted?.();
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    });
    const input = {
      query: "",
      statuses: [],
      page_token: "",
      sort: "title",
      direction: "ascending",
    };
    const key = runtime.queryKey("query:list-items", input);
    expect(key).not.toEqual(
      runtime.queryKey("query:list-items", {
        ...input,
        sort: "status",
      }),
    );
    expect(key).not.toEqual(
      runtime.queryKey("query:list-items", {
        ...input,
        direction: "descending",
      }),
    );
    const operation = runtime.query<{ readonly items: readonly unknown[] }>(
      "query:list-items",
      input,
    );

    await started;
    expect(runtime.queryClient.getQueryState(key)?.fetchStatus).toBe(
      "fetching",
    );
    if (complete === undefined) {
      throw new Error("Expected the test transport query to start.");
    }
    complete({ items: [] });

    await expect(operation).resolves.toEqual({ items: [] });
    expect(runtime.queryClient.getQueryState(key)?.status).toBe("success");
  });

  it("surfaces typed operation failures in a real browser", async () => {
    const runtime = createBrowserOperationRuntime({
      "oui.reference.v1.ReferenceFrontendService.ListItems": () => {
        throw {
          code: "invalid_argument",
          message: "Invalid browser query.",
          correlationId: "correlation:browser",
        };
      },
    });

    await expect(
      runtime.query("query:list-items", {
        query: "",
        statuses: [],
        page_token: "",
      }),
    ).rejects.toMatchObject({
      kind: "validation",
      correlationId: "correlation:browser",
      retryable: false,
    });
  });

  it("cancels commands through the browser transport", async () => {
    const runtime = createBrowserOperationRuntime({
      "oui.reference.v1.ReferenceFrontendService.UpdateItem": ({ signal }) =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    });
    const controller = new AbortController();
    const operation = runtime.command(
      "command:update-item",
      { item_id: "item:browser" },
      { signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();

    await expect(operation).rejects.toMatchObject({
      kind: "cancelled",
      retryable: false,
    });
  });

  it("retries safe browser queries before succeeding", async () => {
    let attempts = 0;
    const runtime = createBrowserOperationRuntime({
      "oui.reference.v1.ReferenceFrontendService.ListItems": () => {
        attempts += 1;
        if (attempts < 3) {
          throw { code: "unavailable", message: "Temporary failure." };
        }
        return { items: [] };
      },
    });

    await expect(
      runtime.query("query:list-items", {
        query: "",
        statuses: [],
        page_token: "",
      }),
    ).resolves.toEqual({ items: [] });
    expect(attempts).toBe(3);
  });

  it("keeps a predictable keyboard focus order with visible focus", async () => {
    const { host, root } = await render(
      <OUIThemeProvider density="comfortable" theme={dawnTheme}>
        <Inline>
          <Link href="#first">First destination</Link>
          <Field label="Second field" />
          <Button>Third action</Button>
        </Inline>
      </OUIThemeProvider>,
    );

    const link = host.querySelector<HTMLAnchorElement>("a");
    const input = host.querySelector<HTMLInputElement>("input");
    const button = host.querySelector<HTMLButtonElement>("button");
    if (link === null || input === null || button === null) {
      throw new Error("Expected all focus-order primitives to render.");
    }

    await act(async () => {
      await userEvent.tab();
    });
    expect(document.activeElement).toBe(link);
    await act(async () => {
      await userEvent.tab();
    });
    expect(document.activeElement).toBe(input);
    await act(async () => {
      await userEvent.tab();
    });
    expect(document.activeElement).toBe(button);
    expect(button.dataset.focusVisible).toBe("true");
    expect(getComputedStyle(button).outlineStyle).not.toBe("none");

    await act(() => {
      root.unmount();
    });
  });

  it("normalizes pointer, keyboard, and touch activation to one action", async () => {
    let activations = 0;
    const { host, root } = await render(
      <Button
        onAction={() => {
          activations += 1;
        }}
      >
        Activate
      </Button>,
    );
    const button = host.querySelector<HTMLButtonElement>("button");
    if (button === null) {
      throw new Error("Expected the activation button to render.");
    }

    await act(async () => {
      await userEvent.click(button);
    });
    expect(activations).toBe(1);

    button.focus();
    await act(async () => {
      await userEvent.keyboard("{Enter}");
    });
    expect(activations).toBe(2);

    await act(() => {
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          pointerId: 7,
          pointerType: "touch",
        }),
      );
      button.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          isPrimary: true,
          pointerId: 7,
          pointerType: "touch",
        }),
      );
      button.click();
    });
    expect(activations).toBe(3);

    await act(() => {
      root.unmount();
    });
  });

  it("exposes testable names, descriptions, roles, and states", async () => {
    const { host, root } = await render(<StackForStateCoverage />);

    const invalidInput = host.querySelector<HTMLInputElement>(
      'input[aria-invalid="true"]',
    );
    const busyButton =
      host.querySelector<HTMLButtonElement>("button[data-busy]");
    const busyStatus = host.querySelector<HTMLOutputElement>(
      'output[aria-busy="true"]',
    );
    const disabledButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => candidate.textContent === "Disabled action");

    expect(invalidInput?.getAttribute("aria-describedby")).toBeTruthy();
    expect(busyButton?.dataset.busy).toBe("true");
    expect(busyButton?.disabled).toBe(true);
    expect(busyStatus?.getAttribute("aria-label")).toBe("Save status");
    expect(disabledButton?.disabled).toBe(true);
    expect(host.querySelector('[role="status"]')).not.toBeNull();

    await act(() => {
      root.unmount();
    });
  });

  it.each<PrimitiveShowcaseState>([
    "default",
    "disabled",
    "invalid",
    "busy",
    "unavailable",
  ])("has no automatic axe violations in the %s story state", async (state) => {
    const { host, root } = await render(
      <OUIThemeProvider density="comfortable" theme={dawnTheme}>
        <main>
          <h1>Primitive accessibility test</h1>
          <PrimitiveShowcase state={state} />
        </main>
      </OUIThemeProvider>,
    );

    const results = await axe.run(host);
    expect(results.violations.map(({ id }) => id)).toEqual([]);

    await act(() => {
      root.unmount();
    });
  });

  it("makes providers available in the declared order", async () => {
    expect(applicationProviderOrder).toEqual([
      "runtime",
      "application",
      "session",
    ]);
    const bootstrap = createReadyApplication(
      "actor:provider",
      "Provider actor",
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(() => {
      root.render(
        <OUIApplicationRoot bootstrap={bootstrap}>
          <ContextProbe />
        </OUIApplicationRoot>,
      );
    });

    expect(host.textContent).toContain(
      "application:reference|actor:provider|1.0.0",
    );

    await act(() => {
      root.unmount();
    });
  });

  it("renders invalid startup input in a bounded diagnostic surface", async () => {
    const bootstrap = createApplication({
      ir: '{"irVersion":',
      runtime: createRuntimeConfiguration("actor:invalid", "Invalid actor"),
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(() => {
      root.render(<OUIApplicationRoot bootstrap={bootstrap} />);
    });

    expect(host.querySelector("[data-oui-startup-failure]")).not.toBeNull();
    expect(host.querySelector("[role=alert]")?.textContent).toContain(
      "IR_SYNTAX_INVALID",
    );

    await act(() => {
      root.unmount();
    });
  });

  it("fails startup before render when a required capability is missing", () => {
    const reported: string[] = [];
    const configuration = createRuntimeConfiguration(
      "actor:missing",
      "Missing capability actor",
      reported,
    );
    const bootstrap = createApplication({
      ir: applicationIr,
      runtime: {
        ...configuration,
        capabilities: referenceCapabilities.filter(
          ({ id }) => id !== "interaction.decision",
        ),
      },
    });

    expect(bootstrap.status).toBe("failed");
    expect(bootstrap.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "IR_REQUIRED_CAPABILITY_UNKNOWN",
        irPath: "/requiredCapabilities/3/id",
      }),
    );
    expect(reported).toContain("IR_REQUIRED_CAPABILITY_UNKNOWN");
  });

  it("creates isolated runtime instances", () => {
    const first = createReadyApplication("actor:first", "First actor");
    const second = createReadyApplication("actor:second", "Second actor");

    if (first.status !== "ready" || second.status !== "ready") {
      throw new Error("Expected both applications to initialize.");
    }

    expect(first.runtime).not.toBe(second.runtime);
    expect(first.runtime.session).not.toBe(second.runtime.session);
    expect(first.runtime.session.actor?.id).toBe("actor:first");
    expect(second.runtime.session.actor?.id).toBe("actor:second");
  });
});

function ContextProbe() {
  const application = useOUIApplication();
  const runtime = useOUIRuntime();
  const session = useOUISession();

  return (
    <output>
      {application.id}|{session.actor?.id}|
      {runtime.capabilityVersion("interaction.collection")}
    </output>
  );
}

function StackForStateCoverage() {
  return (
    <OUIThemeProvider density="comfortable" theme={dawnTheme}>
      <PrimitiveShowcase state="invalid" />
      <PrimitiveShowcase state="busy" />
      <PrimitiveShowcase state="disabled" />
    </OUIThemeProvider>
  );
}

function createReadyApplication(actorId: string, displayName: string) {
  return createApplication({
    ir: applicationIr,
    runtime: createRuntimeConfiguration(actorId, displayName),
  });
}

function createRuntimeConfiguration(
  actorId: string,
  displayName: string,
  reported: string[] = [],
) {
  return {
    capabilities: referenceCapabilities,
    services: {
      clock: {
        now: () => new Date("2026-08-13T00:00:00Z"),
      },
      diagnostics: {
        report: ({ code }: { readonly code: string }) => {
          reported.push(code);
        },
      },
    },
    session: {
      actor: {
        id: actorId,
        displayName,
      },
      tenant: null,
      capabilities: [],
      locale: "en-US",
      timeZone: "UTC",
    },
  };
}

function setNativeValue(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  if (setter === undefined) {
    throw new Error("The browser does not expose the input value setter.");
  }

  setter.call(element, value);
}

async function render(element: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  await act(() => {
    root.render(element);
  });

  return { host, root };
}

async function waitForText(host: HTMLElement, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (host.textContent?.includes(expected) === true) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  throw new Error(`Timed out waiting for ${expected}.`);
}

async function waitForLocationSearch(
  history: ReturnType<typeof createMemoryHistory>,
  expected: string,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (history.location.search.includes(expected)) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  throw new Error(`Timed out waiting for URL search ${expected}.`);
}

async function waitForRequestCount(
  requests: readonly unknown[],
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (requests.length >= expected) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  throw new Error(`Timed out waiting for ${expected} requests.`);
}

function findButton(
  host: HTMLElement,
  label: string,
): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

function collectionItemLabels(host: HTMLElement): readonly string[] {
  return Array.from(
    host.querySelectorAll<HTMLAnchorElement>('a[href^="/items/"]'),
  )
    .map((link) => link.textContent ?? "")
    .filter((itemLabel) => itemLabel !== "Items");
}

function definitionValue(host: HTMLElement, term: string): string | undefined {
  const definitionTerm = [...host.querySelectorAll("dt")].find(
    (candidate) => candidate.textContent === term,
  );
  return definitionTerm?.nextElementSibling?.textContent ?? undefined;
}

async function tabUntil(target: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (document.activeElement === target) {
      return;
    }
    await userEvent.tab();
  }
  throw new Error(
    `Could not reach ${target.textContent ?? target.tagName} by tab.`,
  );
}

function createBrowserOperationRuntime(
  handlers: Readonly<Record<string, TestConnectHandler>>,
) {
  if (applicationBootstrap.status !== "ready") {
    throw new Error("Expected the reference application to initialize.");
  }
  const clients = createConnectClientRegistry();
  clients.register({
    serviceBindingId: "service:reference",
    client: new TestConnectClient(
      "oui.reference.v1.ReferenceFrontendService",
      handlers,
    ),
  });
  return createOperationRuntime({
    application: applicationBootstrap.application,
    clients,
    identity: referenceContractIdentity,
    session: applicationBootstrap.runtime.session,
  });
}
