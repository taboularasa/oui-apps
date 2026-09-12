import { DetailPattern } from "@oui/resource-patterns";
import type { OUIInteractionComponentProps } from "@oui/router";
import { useReferenceApplication } from "../reference-context";

export default function DetailInteraction({
  interaction,
  navigate,
  parameters,
  resolveHref,
  search,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } = useReferenceApplication();

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
