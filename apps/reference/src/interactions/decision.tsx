import { DecisionPattern } from "@oui/decision-patterns";
import type { OUIInteractionComponentProps } from "@oui/router";
import { useReferenceApplication } from "../reference-context";

export default function DecisionInteraction({
  interaction,
  parameters,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } = useReferenceApplication();

  return (
    <DecisionPattern
      application={applicationBootstrap.application}
      interaction={interaction}
      operationRuntime={operationRuntime}
      operationStream={{
        serviceId: "service:reference",
        method: "oui.reference.v1.ReferenceFrontendService.WatchOperation",
      }}
      parameters={parameters}
      session={applicationBootstrap.runtime.session}
    />
  );
}
