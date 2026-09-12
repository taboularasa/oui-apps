import { DetailPattern } from "@oui/resource-patterns";
import type { OUIInteractionComponentProps } from "@oui/router";
import { useProfessionalServicesApplication } from "../professional-services-context";

export default function DetailInteraction({
  interaction,
  navigate,
  parameters,
  resolveHref,
  search,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } =
    useProfessionalServicesApplication();
  return (
    <DetailPattern
      application={applicationBootstrap.application}
      interaction={interaction}
      onNavigate={navigate}
      operationRuntime={operationRuntime}
      parameters={parameters}
      resolveHref={resolveHref}
      search={search}
    />
  );
}
