import { assign, setup } from "xstate";

export interface DecisionMachineContext {
  readonly selectedAlternative: string | undefined;
  readonly reason: string;
  readonly evidenceReviewed: boolean;
  readonly outcome: unknown;
  readonly error: unknown;
}

export type DecisionMachineEvent =
  | { readonly type: "EVIDENCE_REVIEWED"; readonly reviewed: boolean }
  | { readonly type: "SELECT"; readonly alternativeId: string }
  | { readonly type: "SET_REASON"; readonly reason: string }
  | { readonly type: "REQUEST" }
  | { readonly type: "CANCEL_CONFIRMATION" }
  | { readonly type: "CONFIRM" }
  | { readonly type: "RESOLVE"; readonly output: unknown }
  | { readonly type: "CONFLICT"; readonly error: unknown }
  | { readonly type: "REJECT"; readonly error: unknown }
  | { readonly type: "REFRESH" }
  | { readonly type: "RETRY" };

export interface DecisionMachineOptions {
  readonly evidenceRequired: boolean;
  readonly alternatives: Readonly<
    Record<
      string,
      {
        readonly available: boolean;
        readonly reasonRequired: boolean;
        readonly confirmationRequired: boolean;
      }
    >
  >;
}

export function createDecisionMachine(options: DecisionMachineOptions) {
  const canSubmit = ({
    context,
  }: {
    readonly context: DecisionMachineContext;
  }): boolean => {
    const alternative =
      context.selectedAlternative === undefined
        ? undefined
        : options.alternatives[context.selectedAlternative];
    return (
      alternative?.available === true &&
      (!options.evidenceRequired || context.evidenceReviewed) &&
      (!alternative.reasonRequired || context.reason.trim() !== "")
    );
  };
  const needsConfirmation = ({
    context,
  }: {
    readonly context: DecisionMachineContext;
  }): boolean =>
    canSubmit({ context }) &&
    (context.selectedAlternative === undefined
      ? false
      : options.alternatives[context.selectedAlternative]
          ?.confirmationRequired === true);

  return setup({
    types: {
      context: {} as DecisionMachineContext,
      events: {} as DecisionMachineEvent,
    },
    guards: {
      canSubmit,
      needsConfirmation,
    },
  }).createMachine({
    id: "oui-decision",
    initial: "reviewing",
    context: {
      selectedAlternative: undefined,
      reason: "",
      evidenceReviewed: false,
      outcome: undefined,
      error: undefined,
    },
    states: {
      reviewing: {
        on: {
          EVIDENCE_REVIEWED: {
            actions: assign({
              evidenceReviewed: ({ event }) => event.reviewed,
            }),
          },
          SELECT: {
            actions: assign({
              selectedAlternative: ({ event }) => event.alternativeId,
              reason: "",
              error: undefined,
            }),
          },
          SET_REASON: {
            actions: assign({
              reason: ({ event }) => event.reason,
            }),
          },
          REQUEST: [
            {
              guard: "needsConfirmation",
              target: "confirming",
            },
            {
              guard: "canSubmit",
              target: "submitting",
            },
          ],
        },
      },
      confirming: {
        on: {
          CANCEL_CONFIRMATION: "reviewing",
          CONFIRM: "submitting",
        },
      },
      submitting: {
        on: {
          RESOLVE: {
            target: "success",
            actions: assign({
              outcome: ({ event }) => event.output,
              error: undefined,
            }),
          },
          CONFLICT: {
            target: "conflict",
            actions: assign({
              error: ({ event }) => event.error,
            }),
          },
          REJECT: {
            target: "failure",
            actions: assign({
              error: ({ event }) => event.error,
            }),
          },
        },
      },
      conflict: {
        on: {
          REFRESH: {
            target: "reviewing",
            actions: assign({
              selectedAlternative: undefined,
              reason: "",
              evidenceReviewed: false,
              error: undefined,
            }),
          },
        },
      },
      failure: {
        on: {
          RETRY: "submitting",
          REFRESH: "reviewing",
        },
      },
      success: {
        type: "final",
      },
    },
  });
}
