import { CollectionPattern } from "@oui/resource-patterns";
import type { OUIInteractionComponentProps } from "@oui/router";
import { useObligationApplication } from "../obligation-context";

export default function CollectionInteraction({
  interaction,
  navigate,
  parameters,
  resolveHref,
  search,
  updateSearch,
}: OUIInteractionComponentProps) {
  const { applicationBootstrap, operationRuntime } = useObligationApplication();

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
