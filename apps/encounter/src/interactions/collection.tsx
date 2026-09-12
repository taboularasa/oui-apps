import { CollectionPattern } from "@oui/resource-patterns";
import type { OUIInteractionComponentProps } from "@oui/router";
import { useEncounterApplication } from "../encounter-context";

export default function CollectionInteraction({
  interaction,
  navigate,
  parameters,
  resolveHref,
  search,
  updateSearch,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } = useEncounterApplication();

  return (
    <CollectionPattern
      application={applicationBootstrap.application}
      interaction={interaction}
      onNavigate={navigate}
      onSearchChange={updateSearch}
      operationRuntime={operationRuntime}
      parameters={parameters}
      resolveHref={resolveHref}
      search={search}
    />
  );
}
