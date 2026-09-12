import { useEffect, useMemo, useState } from "react";
import { IRDrivenForm } from "@oui/forms";
import type { OUIInteractionComponentProps } from "@oui/router";
import { buildRoutePath, materializeQueryInput } from "@oui/resource-patterns";
import { Button, Feedback, Stack, Status } from "@oui/react-aria";
import { useEncounterApplication } from "../encounter-context";

export default function FormInteraction({
  interaction,
  navigate,
  parameters,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } = useEncounterApplication();
  const relationshipOptions = useRelationshipOptions(operationRuntime);
  // A create form declares that it starts from defaults, so there is no
  // initial-values query to load.
  const startsFromDefaults =
    readString(interaction.form?.initialValues.source) === "defaults";
  const queryId = startsFromDefaults
    ? ""
    : readString(interaction.form?.initialValues.query);
  const itemPath = readString(interaction.form?.initialValues.path) || "item";
  const query = applicationBootstrap.application.queries[queryId];
  const input = useMemo(
    () =>
      query === undefined ? {} : materializeQueryInput(query, parameters, {}),
    [parameters, query],
  );
  const loaded = useInitialValues(operationRuntime, queryId, itemPath, input);
  const { loading, error, retry, acceptCommandResult } = loaded;
  const initialValues = startsFromDefaults ? {} : loaded.initialValues;

  if (loading) {
    return (
      <Status busy label="Form loading status">
        Loading current values
      </Status>
    );
  }
  if (error !== undefined) {
    return (
      <Feedback kind="error">
        The current values could not be loaded.{" "}
        <Button onAction={retry}>Retry</Button>
      </Feedback>
    );
  }
  if (initialValues === undefined) {
    return (
      <Feedback kind="warning">The requested item is not available.</Feedback>
    );
  }

  return (
    <Stack>
      <h1>{interaction.label.fallback ?? "Form"}</h1>
      <IRDrivenForm
        application={applicationBootstrap.application}
        confirmDiscard={() => window.confirm("Discard unsaved changes?")}
        initialValues={initialValues}
        interaction={interaction}
        onSuccess={(output) => {
          acceptCommandResult(output);
          // The form declares where a successful submission lands. Honouring
          // it here keeps the navigation in the IR rather than in the screen.
          const success = interaction.form?.success;
          if (
            success?.kind === "navigate" &&
            typeof success.route === "string"
          ) {
            const route =
              applicationBootstrap.application.routes[success.route];
            if (route !== undefined) {
              navigate(
                buildRoutePath(route, identityValue(output, parameters)),
              );
            }
          }
        }}
        operationRuntime={operationRuntime}
        relationshipOptions={relationshipOptions}
        routeParameters={parameters}
        session={applicationBootstrap.runtime.session}
      />
    </Stack>
  );
}

function useInitialValues(
  operationRuntime: ReturnType<
    typeof useEncounterApplication
  >["operationRuntime"],
  queryId: string,
  itemPath: string,
  input: Readonly<Record<string, unknown>>,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    readonly initialValues?: Readonly<Record<string, unknown>>;
    readonly error?: unknown;
    readonly loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    let active = true;
    setState({ loading: true });
    if (queryId === "") {
      // A form that starts from defaults has nothing to load.
      setState({ loading: false });
      return () => {
        active = false;
      };
    }
    void operationRuntime
      .query<Readonly<Record<string, unknown>>>(queryId, input)
      .then((output) => {
        if (active) {
          const values = readRecord(readPath(output, itemPath));
          setState({
            ...(values === undefined ? {} : { initialValues: values }),
            loading: false,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) setState({ error, loading: false });
      });
    return () => {
      active = false;
    };
  }, [attempt, input, itemPath, operationRuntime, queryId]);

  return {
    ...state,
    acceptCommandResult: (output: unknown) => {
      const values = readRecord(readPath(output, itemPath));
      if (values !== undefined) {
        setState({ initialValues: values, loading: false });
      }
    },
    retry: () => setAttempt((current) => current + 1),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, segment) =>
        typeof current === "object" && current !== null
          ? (current as Readonly<Record<string, unknown>>)[segment]
          : undefined,
      value,
    );
}

function readRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

/**
 * Relationship pickers are populated from the application's own compiled
 * queries, so the options a person can choose are the resources the BFF
 * actually discloses to them.
 */
function useRelationshipOptions(
  operationRuntime: ReturnType<
    typeof useEncounterApplication
  >["operationRuntime"],
): Readonly<Record<string, readonly { id: string; label: string }[]>> {
  const [customers, setCustomers] = useState<
    readonly { id: string; label: string }[]
  >([]);

  useEffect(() => {
    let active = true;
    void operationRuntime
      .query<Readonly<Record<string, unknown>>>("query:list-customers", {})
      .then((output) => {
        const rows = Array.isArray(output.customers) ? output.customers : [];
        if (!active) return;
        setCustomers(
          rows
            .filter(
              (row): row is Record<string, unknown> =>
                row !== null && typeof row === "object",
            )
            .map((row) => ({
              id: String(row.id ?? ""),
              label: String(row.name ?? row.id ?? ""),
            }))
            .filter((option) => option.id !== ""),
        );
      })
      .catch(() => {
        if (active) setCustomers([]);
      });
    return () => {
      active = false;
    };
  }, [operationRuntime]);

  return useMemo(
    () => ({ "field:encounter.customerId": customers }),
    [customers],
  );
}

/**
 * The route a successful submission lands on may need the resource identity.
 * Prefer the value the command returned, then the route parameters already in
 * scope, so a create lands on the resource it just made.
 */
function identityValue(
  output: unknown,
  parameters: Readonly<Record<string, string | number>>,
): string {
  const record = readRecord(output);
  for (const key of Object.keys(record ?? {})) {
    const nested = readRecord(record?.[key]);
    if (nested !== undefined && typeof nested.id === "string") {
      return nested.id;
    }
  }
  const [first] = Object.values(parameters);
  return first === undefined ? "" : String(first);
}
