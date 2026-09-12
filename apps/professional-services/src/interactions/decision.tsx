import { DecisionPattern } from "@oui/decision-patterns";
import type { OUIInteractionComponentProps } from "@oui/router";
import { useProfessionalServicesApplication } from "../professional-services-context";

export default function DecisionInteraction({
  interaction,
  parameters,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } =
    useProfessionalServicesApplication();
  return (
    <DecisionPattern
      application={applicationBootstrap.application}
      interaction={interaction}
      operationRuntime={operationRuntime}
      parameters={parameters}
      session={applicationBootstrap.runtime.session}
    />
  );
}
