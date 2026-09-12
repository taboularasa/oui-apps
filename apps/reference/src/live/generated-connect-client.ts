import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  createGeneratedConnectClient,
  type GeneratedConnectClient,
} from "@oui/data";
import { createReferenceBrowserClient } from "../generated/ontobff/connect-es/reference_client";
import {
  ItemSortField,
  ItemStatus,
  OperationStatus,
  ProposalStatus,
  SortDirection,
  type DecideProposalResponse,
  type GetCompatibilityResponse,
  type GetDecisionContextResponse,
  type GetSessionResponse,
  type Item,
  type OperationAcknowledgement,
  type Proposal,
  type WatchOperationResponse,
} from "../generated/ontobff/connect-es/oui/reference/v1/reference_pb";

export const referenceServiceType = "oui.reference.v1.ReferenceFrontendService";

type ReferenceBrowserClient = ReturnType<typeof createReferenceBrowserClient>;

export function createReferenceGeneratedConnectClient(
  baseUrl: string,
): GeneratedConnectClient {
  return adaptReferenceBrowserClient(createReferenceBrowserClient(baseUrl));
}

export function createReferenceGeneratedConnectClientForTest(
  client: ReferenceBrowserClient,
): GeneratedConnectClient {
  return adaptReferenceBrowserClient(client);
}

function adaptReferenceBrowserClient(
  client: ReferenceBrowserClient,
): GeneratedConnectClient {
  return createGeneratedConnectClient(
    referenceServiceType,
    {
      [`${referenceServiceType}.GetCompatibility`]: async (_input, options) =>
        mapCompatibility(await client.getCompatibility({}, options)),
      [`${referenceServiceType}.GetSession`]: async (_input, options) =>
        mapSession(await client.getSession({}, options)),
      [`${referenceServiceType}.ListItems`]: async (input, options) => {
        const sort = readRecord(input.sort);
        return mapListItems(
          await client.listItems(
            {
              pageSize: readNumber(input.page_size),
              pageToken: readString(input.page_token),
              query: readString(input.query),
              statuses: readArray(input.statuses).map(mapItemStatusInput),
              sort: {
                field: mapSortFieldInput(sort.field ?? input.sort),
                direction: mapSortDirectionInput(
                  sort.direction ?? input.direction,
                ),
              },
            },
            options,
          ),
        );
      },
      [`${referenceServiceType}.GetItem`]: async (input, options) => {
        const response = await client.getItem(
          { itemId: readString(input.item_id) },
          options,
        );
        return {
          item:
            response.item === undefined ? undefined : mapItem(response.item),
        };
      },
      [`${referenceServiceType}.UpdateItem`]: async (input, options) => {
        const response = await client.updateItem(
          {
            itemId: readString(input.item_id),
            expectedVersion: readString(input.expected_version),
            changes: mapItemInput(readRecord(input.changes)),
            updateMask: {
              paths: readArray(input.update_mask)
                .map(String)
                .filter((path) => path === "title"),
            },
          },
          options,
        );
        return {
          item:
            response.item === undefined ? undefined : mapItem(response.item),
          audit_id: response.auditId,
        };
      },
      [`${referenceServiceType}.GetDecisionContext`]: async (input, options) =>
        mapDecisionContext(
          await client.getDecisionContext(
            { proposalId: readString(input.proposal_id) },
            options,
          ),
        ),
      [`${referenceServiceType}.DecideProposal`]: async (input, options) =>
        mapDecision(
          await client.decideProposal(
            {
              proposalId: readString(input.proposal_id),
              expectedVersion: readString(input.expected_version),
              alternativeId: readString(input.alternative_id),
              reason: readString(input.reason),
            },
            options,
          ),
        ),
    },
    {
      [`${referenceServiceType}.WatchOperation`]: (input, options) =>
        mapOperationStream(
          client.watchOperation(
            {
              operationId: readString(input.operation_id),
              resumeToken: readString(input.resume_token),
            },
            options,
          ),
        ),
    },
  );
}

async function* mapOperationStream(
  events: AsyncIterable<WatchOperationResponse>,
) {
  for await (const event of events) {
    yield mapOperationEvent(event);
  }
}

function mapCompatibility(response: GetCompatibilityResponse) {
  return {
    applicationId: response.applicationId,
    irVersion: response.irVersion,
    irDigest: response.irDigest,
    bffPlanDigest: response.bffPlanDigest,
    descriptorDigest: response.descriptorDigest,
    generatedGoDigest: response.generatedGoDigest,
    connectDigest: response.connectDigest,
    generatorVersion: response.generatorVersion,
    runtimeVersion: response.runtimeVersion,
    manifestDigest: response.manifestDigest,
    contractDigest: response.contractDigest,
    capabilities: [...response.capabilities],
  };
}

function mapSession(response: GetSessionResponse) {
  return {
    actor:
      response.actor === undefined
        ? undefined
        : {
            id: response.actor.id,
            displayName: response.actor.displayName,
          },
    tenant: null,
    permissions: [...response.capabilities],
    locale: response.locale,
    timeZone: response.timeZone,
  };
}

function mapListItems(response: {
  readonly items: readonly Item[];
  readonly nextPageToken: string;
  readonly resultVersion: string;
}) {
  return {
    items: response.items.map(mapItem),
    next_page_token: response.nextPageToken,
    result_version: response.resultVersion,
  };
}

function mapItem(item: Item) {
  return {
    id: item.id,
    version: item.version,
    title: item.title,
    status: mapItemStatusOutput(item.status),
    owner: item.owner?.displayName,
    dueAt:
      item.dueAt === undefined
        ? undefined
        : timestampDate(item.dueAt).toISOString(),
    history: item.history.map((event) => ({
      id: event.id,
      occurredAt:
        event.occurredAt === undefined
          ? undefined
          : timestampDate(event.occurredAt).toISOString(),
      actor: event.actor?.displayName,
      kind: event.kind,
      summary: event.summary,
    })),
  };
}

function mapItemInput(input: Readonly<Record<string, unknown>>) {
  return {
    title: readString(input.title),
  };
}

function mapDecisionContext(response: GetDecisionContextResponse) {
  return {
    proposal:
      response.proposal === undefined
        ? undefined
        : mapProposal(response.proposal),
    evidence: response.evidence.map((evidence) => ({
      id: evidence.id,
      label: evidence.label,
      summary: evidence.summary,
      requiredBeforeDecision: evidence.requiredBeforeDecision,
    })),
    alternatives: response.alternatives.map((alternative) => ({
      id: alternative.id,
      label: alternative.label,
      reasonRequired: alternative.reasonRequired,
      confirmationRequired: alternative.confirmationRequired,
    })),
    policy_explanation: response.policyExplanation,
  };
}

function mapDecision(response: DecideProposalResponse) {
  const outcome =
    response.outcome.case === "proposal"
      ? { proposal: mapProposal(response.outcome.value) }
      : response.outcome.case === "operation"
        ? { operation: mapOperation(response.outcome.value) }
        : {};
  return { ...outcome, audit_id: response.auditId };
}

function mapProposal(proposal: Proposal) {
  return {
    id: proposal.id,
    version: proposal.version,
    title: proposal.title,
    summary: proposal.summary,
    status: mapProposalStatusOutput(proposal.status),
  };
}

function mapOperation(operation: OperationAcknowledgement) {
  return {
    operation_id: operation.operationId,
    accepted_at:
      operation.acceptedAt === undefined
        ? undefined
        : timestampDate(operation.acceptedAt).toISOString(),
    status: mapOperationStatusOutput(operation.status),
    resume_token: operation.resumeToken,
    audit_id: operation.auditId,
  };
}

export function mapOperationEvent(event: WatchOperationResponse) {
  return {
    operation_id: event.operationId,
    sequence: event.sequence,
    status: mapOperationStatusOutput(event.status),
    progress: event.progress,
    message: event.message,
    resume_token: event.resumeToken,
    observed_at:
      event.observedAt === undefined
        ? undefined
        : timestampDate(event.observedAt).toISOString(),
    error:
      event.error === undefined
        ? undefined
        : {
            reason: event.error.reason,
            message: event.error.message,
            retryable: event.error.retryable,
            correlation_id: event.error.correlationId,
          },
  };
}

function mapItemStatusInput(value: unknown): ItemStatus {
  if (typeof value === "number") {
    return value as ItemStatus;
  }
  switch (String(value).toLocaleLowerCase()) {
    case "open":
      return ItemStatus.ITEM_STATUS_OPEN;
    case "blocked":
      return ItemStatus.ITEM_STATUS_BLOCKED;
    case "done":
      return ItemStatus.ITEM_STATUS_DONE;
    default:
      return ItemStatus.ITEM_STATUS_UNSPECIFIED;
  }
}

function mapItemStatusOutput(value: ItemStatus): string {
  switch (value) {
    case ItemStatus.ITEM_STATUS_OPEN:
      return "open";
    case ItemStatus.ITEM_STATUS_BLOCKED:
      return "blocked";
    case ItemStatus.ITEM_STATUS_DONE:
      return "done";
    default:
      return "unspecified";
  }
}

function mapSortFieldInput(value: unknown): ItemSortField {
  switch (String(value).toLocaleLowerCase()) {
    case "title":
      return ItemSortField.ITEM_SORT_FIELD_TITLE;
    case "status":
      return ItemSortField.ITEM_SORT_FIELD_STATUS;
    case "dueat":
    case "due_at":
      return ItemSortField.ITEM_SORT_FIELD_DUE_AT;
    default:
      return ItemSortField.ITEM_SORT_FIELD_UNSPECIFIED;
  }
}

function mapSortDirectionInput(value: unknown): SortDirection {
  return value === "descending"
    ? SortDirection.SORT_DIRECTION_DESCENDING
    : value === "ascending"
      ? SortDirection.SORT_DIRECTION_ASCENDING
      : SortDirection.SORT_DIRECTION_UNSPECIFIED;
}

function mapProposalStatusOutput(value: ProposalStatus): string {
  switch (value) {
    case ProposalStatus.PROPOSAL_STATUS_PENDING:
      return "pending";
    case ProposalStatus.PROPOSAL_STATUS_APPROVED:
      return "approved";
    case ProposalStatus.PROPOSAL_STATUS_REJECTED:
      return "rejected";
    default:
      return "unspecified";
  }
}

function mapOperationStatusOutput(value: OperationStatus): string {
  return (OperationStatus[value] ?? "OPERATION_STATUS_UNSPECIFIED")
    .replace(/^OPERATION_STATUS_/u, "")
    .toLocaleLowerCase();
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
