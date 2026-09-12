import { TestConnectClient } from "@oui/data";
import type { SessionContext } from "@oui/core";
import {
  createReferenceApplicationComposition,
  referenceCapabilities,
  referenceExtensionCatalog,
} from "./application";
import { referenceContractIdentity } from "./live/compatibility";

const referenceItems: readonly Readonly<Record<string, unknown>>[] = [
  {
    id: "item:42",
    version: "version:42",
    title: "Replace compressor filter",
    status: "open",
    owner: "Reference actor",
    dueAt: "2026-08-20T14:00:00Z",
    history: [
      { at: "2026-08-13T09:00:00Z", summary: "Work order created" },
      {
        at: "2026-08-13T10:30:00Z",
        summary: "Assigned to Reference actor",
      },
    ],
  },
  {
    id: "item:43",
    version: "version:43",
    title: "Inspect rooftop unit",
    status: "blocked",
    owner: "Dispatcher",
    dueAt: "2026-08-21T16:00:00Z",
    history: [],
  },
  {
    id: "item:44",
    version: "version:44",
    title: "Confirm permit status",
    status: "done",
    owner: "Reference actor",
    dueAt: "2026-08-18T12:00:00Z",
    history: [],
  },
];

const testClient = new TestConnectClient(
  "oui.reference.v1.ReferenceFrontendService",
  {
    "oui.reference.v1.ReferenceFrontendService.ListItems": ({ input }) => {
      const request = input as {
        readonly query?: unknown;
        readonly statuses?: unknown;
        readonly page_token?: unknown;
        readonly sort?: unknown;
        readonly direction?: unknown;
      };
      const query =
        typeof request.query === "string"
          ? request.query.toLocaleLowerCase()
          : "";
      const statuses = Array.isArray(request.statuses)
        ? request.statuses.filter(
            (status): status is string => typeof status === "string",
          )
        : [];
      const sort = typeof request.sort === "string" ? request.sort : "title";
      const direction =
        request.direction === "descending" ? "descending" : "ascending";
      const filtered = referenceItems
        .filter(
          (item) =>
            query === "" ||
            String(item.title).toLocaleLowerCase().includes(query),
        )
        .filter(
          (item) =>
            statuses.length === 0 || statuses.includes(String(item.status)),
        )
        .toSorted((left, right) => {
          const comparison = String(left[sort] ?? "").localeCompare(
            String(right[sort] ?? ""),
          );
          return direction === "descending" ? -comparison : comparison;
        });
      const offset = request.page_token === "page:2" ? 2 : 0;
      return {
        items: filtered.slice(offset, offset + 2),
        next_page_token: offset + 2 < filtered.length ? "page:2" : "",
      };
    },
    "oui.reference.v1.ReferenceFrontendService.GetItem": ({ input }) => ({
      item: referenceItems.find(
        ({ id }) => id === (input as { readonly item_id?: unknown }).item_id,
      ),
    }),
    "oui.reference.v1.ReferenceFrontendService.GetDecisionContext": ({
      input,
    }) => ({
      proposal: {
        id: (input as { readonly proposal_id?: unknown }).proposal_id,
        version: "version:proposal:42",
        title: "Replace failed rooftop compressor",
        summary:
          "Authorize replacement after reviewing diagnostic and pricing evidence.",
        status: "pending",
      },
      evidence: [
        {
          label: "Diagnostic",
          summary: "Compressor winding is open and cannot be repaired.",
        },
        {
          label: "Estimate",
          summary: "$4,850 including equipment, labor, and commissioning.",
        },
      ],
      alternatives: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
      ],
      policy_explanation:
        "A reviewer with proposal authority may decide while the proposal is pending.",
    }),
    "oui.reference.v1.ReferenceFrontendService.DecideProposal": ({ input }) => {
      const request = input as {
        readonly proposal_id?: unknown;
        readonly expected_version?: unknown;
        readonly alternative_id?: unknown;
        readonly reason?: unknown;
      };
      if (request.reason === "simulate stale") {
        throw {
          code: "aborted",
          message: "The proposal was updated by another reviewer.",
          details: [
            {
              type: "oui.reference.v1.StaleStateDetail",
              value: { currentVersion: "version:proposal:43" },
            },
          ],
        };
      }
      return {
        proposal: {
          id: request.proposal_id,
          version: request.expected_version,
          status:
            request.alternative_id === "approve" ? "approved" : "rejected",
        },
        audit_id: "audit:reference:decide-proposal",
      };
    },
    "oui.reference.v1.ReferenceFrontendService.UpdateItem": ({ input }) => {
      const request = input as {
        readonly item_id?: unknown;
        readonly changes?: Readonly<Record<string, unknown>>;
      };
      if (request.changes?.title === "Rejected title") {
        throw {
          code: "invalid_argument",
          message: "The BFF rejected the submitted values.",
          details: [
            {
              type: "oui.reference.v1.ValidationErrorDetail",
              value: {
                violations: [
                  {
                    fieldPath: "changes.title",
                    message: "Choose another title.",
                  },
                ],
              },
            },
          ],
        };
      }
      return {
        item: {
          ...referenceItems.find(({ id }) => id === request.item_id),
          ...request.changes,
        },
        audit_id: "audit:reference:update-item",
      };
    },
  },
);

export const referenceTestSession: SessionContext = Object.freeze({
  actor: { id: "actor:reference", displayName: "Reference actor" },
  tenant: null,
  capabilities: [
    "permission:item.update",
    "permission:proposal.view",
    "permission:proposal.decide",
    "permission:proposal.reject",
  ],
  locale: "en-US",
  timeZone: "UTC",
});

export const referenceTestComposition = createReferenceApplicationComposition({
  client: testClient,
  identity: referenceContractIdentity,
  metadata: { getMetadata: () => ({ deadlineMs: 5_000 }) },
  session: referenceTestSession,
});

export const applicationBootstrap =
  referenceTestComposition.applicationBootstrap;
export const referenceOperationRuntime =
  referenceTestComposition.operationRuntime;
export { referenceCapabilities, referenceExtensionCatalog };
