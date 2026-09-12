import { useEffect, useMemo, useState } from "react";
import { IRDrivenForm } from "@oui/forms";
import type { OUIInteractionComponentProps } from "@oui/router";
import { materializeQueryInput } from "@oui/resource-patterns";
import { Button, Feedback, Stack, Status } from "@oui/react-aria";
import { useReferenceApplication } from "../reference-context";

export default function FormInteraction({
  interaction,
  parameters,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } = useReferenceApplication();
  const queryId = readString(interaction.form?.initialValues.query);
  const itemPath = readString(interaction.form?.initialValues.path) || "item";
  const query = applicationBootstrap.application.queries[queryId];
  const input = useMemo(
    () =>
      query === undefined ? {} : materializeQueryInput(query, parameters, {}),
    [parameters, query],
  );
  const { initialValues, loading, error, retry, acceptCommandResult } =
    useInitialValues(operationRuntime, queryId, itemPath, input);

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
      <output aria-label="Route parameters">
        {JSON.stringify(parameters)}
      </output>
      <IRDrivenForm
        application={applicationBootstrap.application}
        confirmDiscard={() => window.confirm("Discard unsaved changes?")}
        initialValues={initialValues}
        interaction={interaction}
        onSuccess={acceptCommandResult}
        operationRuntime={operationRuntime}
        relationshipOptions={{
          "field:item.owner": [
            {
              id: "actor:reference",
              label: "Reference actor",
            },
            {
              id: "actor:dispatcher",
              label: "Dispatcher",
            },
          ],
        }}
        routeParameters={parameters}
        session={applicationBootstrap.runtime.session}
      />
    </Stack>
  );
}

function useInitialValues(
  operationRuntime: ReturnType<
    typeof useReferenceApplication
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
      setState({
        error: new Error("The form does not declare its initial-values query."),
        loading: false,
      });
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
