import type {
  ApplicationDefinition,
  CommandDefinition,
  InteractionDefinition,
  JsonValue,
  PermissionExpression,
  QueryDefinition,
  SessionContext,
} from "@oui/core";

export interface DecisionAlternativeModel {
  readonly id: string;
  readonly label: string;
  readonly command: CommandDefinition;
  readonly arguments: Readonly<Record<string, JsonValue>>;
  readonly reason: "optional" | "required";
  readonly confirmationRequired: boolean;
  readonly available: boolean;
  readonly unavailableExplanation?: string;
}

export interface DecisionPreconditionModel {
  readonly id: string;
  readonly kind: string;
  readonly field?: string;
  readonly value?: JsonValue;
}

export interface DecisionPatternModel {
  readonly interaction: InteractionDefinition;
  readonly query: QueryDefinition;
  readonly subjectPath: string;
  readonly evidencePath: string;
  readonly evidenceRequiredBeforeAction: boolean;
  readonly policyPath?: string;
  readonly alternatives: readonly DecisionAlternativeModel[];
  readonly preconditions: readonly DecisionPreconditionModel[];
  readonly conflictRecovery: string;
  readonly authority: {
    readonly actorId?: string;
    readonly actorName?: string;
    readonly available: boolean;
  };
}

export function compileDecisionPattern(
  application: ApplicationDefinition,
  interaction: InteractionDefinition,
  session: SessionContext,
): DecisionPatternModel {
  if (interaction.kind !== "decision" || interaction.decision === undefined) {
    throw new Error(`Interaction ${interaction.id} is not a decision.`);
  }
  const definition = interaction.decision;
  const query = application.queries[definition.query];
  if (query === undefined) {
    throw new Error(
      `Decision ${interaction.id} references unknown query ${definition.query}.`,
    );
  }
  const policyRegion = interaction.regions.find(
    ({ kind }) => kind === "policy",
  );
  const evidencePath = readString(definition.evidence.sourcePath) ?? "evidence";
  const alternatives = definition.alternatives.map((alternative) => {
    const commandId = readString(alternative.command);
    const command =
      commandId === undefined ? undefined : application.commands[commandId];
    if (command === undefined) {
      throw new Error(
        `Decision ${interaction.id} references unknown command ${String(commandId)}.`,
      );
    }
    const requiredPermissions = readPermission(alternative.requiredPermissions);
    const available = hasPermission(requiredPermissions, session.capabilities);
    const unavailable = readRecord(alternative.unavailable);
    const explanation = readLocalized(unavailable.explanation);
    const commandConfirmation = readRecord(command.confirmation);

    return Object.freeze({
      id: String(alternative.id),
      label: readLocalized(alternative.label) || String(alternative.id),
      command,
      arguments: readRecord(alternative.commandArguments),
      reason: alternative.reason === "required" ? "required" : "optional",
      confirmationRequired:
        alternative.confirmation === "required" &&
        commandConfirmation.required === true,
      available,
      ...(explanation === "" ? {} : { unavailableExplanation: explanation }),
    });
  });

  return Object.freeze({
    interaction,
    query,
    subjectPath: definition.subjectPath,
    evidencePath,
    evidenceRequiredBeforeAction:
      definition.evidence.requiredBeforeAction === true,
    ...(policyRegion?.sourcePath === undefined
      ? {}
      : { policyPath: policyRegion.sourcePath }),
    alternatives: Object.freeze(alternatives),
    preconditions: Object.freeze(
      definition.preconditions.map((precondition) =>
        Object.freeze({
          id: String(precondition.id),
          kind: String(precondition.kind),
          ...(typeof precondition.field === "string"
            ? { field: fieldName(precondition.field) }
            : {}),
          ...(precondition.value === undefined
            ? {}
            : { value: precondition.value }),
        }),
      ),
    ),
    conflictRecovery: String(
      definition.conflictRecovery?.kind ?? "refresh_and_explain",
    ),
    authority: Object.freeze({
      ...(session.actor?.id === undefined ? {} : { actorId: session.actor.id }),
      ...(session.actor?.displayName === undefined
        ? {}
        : { actorName: session.actor.displayName }),
      available: hasPermission(
        interaction.requiredPermissions,
        session.capabilities,
      ),
    }),
  });
}

export function materializeDecisionQueryInput(
  model: DecisionPatternModel,
  parameters: Readonly<Record<string, string | number>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(model.query.input.bindings).map(([target, binding]) => [
        target,
        binding.source === "route"
          ? parameters[parameterName(binding.parameter ?? "")]
          : binding.source === "literal"
            ? binding.value
            : undefined,
      ]),
    ),
  );
}

export function materializeDecisionCommandInput(
  alternative: DecisionAlternativeModel,
  contextOutput: Readonly<Record<string, unknown>>,
  parameters: Readonly<Record<string, string | number>>,
  reason: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(alternative.command.input.bindings).map(
        ([target, binding]) => {
          if (alternative.arguments[target] !== undefined) {
            return [target, alternative.arguments[target]];
          }
          if (binding.source === "route") {
            return [target, parameters[parameterName(binding.parameter ?? "")]];
          }
          if (binding.source === "query_output") {
            return [target, readPath(contextOutput, binding.path ?? "")];
          }
          if (binding.source === "interaction") {
            return [target, binding.value === "reason" ? reason : undefined];
          }
          if (binding.source === "literal") {
            return [target, binding.value];
          }
          return [target, undefined];
        },
      ),
    ),
  );
}

export function evaluateDecisionPreconditions(
  model: DecisionPatternModel,
  subject: Readonly<Record<string, unknown>>,
): readonly {
  readonly id: string;
  readonly satisfied: boolean;
  readonly explanation: string;
}[] {
  return model.preconditions.map((precondition) => {
    const actual =
      precondition.field === undefined
        ? undefined
        : subject[precondition.field];
    const satisfied =
      precondition.kind !== "field_equals" ||
      Object.is(actual, precondition.value);
    return Object.freeze({
      id: precondition.id,
      satisfied,
      explanation: satisfied
        ? `Precondition ${precondition.id} is satisfied.`
        : `This decision requires ${precondition.field ?? "the subject"} to be ${String(precondition.value)}.`,
    });
  });
}

export function decisionConfirmationMessage(
  alternative: DecisionAlternativeModel,
): string {
  const confirmation = readRecord(alternative.command.confirmation);
  return (
    readLocalized(confirmation.message) ||
    `Confirm ${alternative.label.toLocaleLowerCase()}.`
  );
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return typeof current === "object" &&
      current !== null &&
      !Array.isArray(current)
      ? (current as Readonly<Record<string, unknown>>)[segment]
      : undefined;
  }, value);
}

function readRecord(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, JsonValue>>)
    : {};
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readLocalized(value: JsonValue | undefined): string {
  const localized = readRecord(value);
  return typeof localized.fallback === "string"
    ? localized.fallback
    : typeof localized.id === "string"
      ? localized.id
      : "";
}

function readPermission(
  value: JsonValue | undefined,
): PermissionExpression | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as unknown as PermissionExpression)
    : undefined;
}

function hasPermission(
  expression: PermissionExpression | undefined,
  capabilities: readonly string[],
): boolean {
  if (expression === undefined) {
    return true;
  }
  if (expression.kind === "permission") {
    return (
      expression.permission !== undefined &&
      capabilities.includes(expression.permission)
    );
  }
  if (expression.kind === "not") {
    return (
      expression.operand !== undefined &&
      !hasPermission(expression.operand, capabilities)
    );
  }
  const operands = expression.operands ?? [];
  return expression.kind === "all_of"
    ? operands.every((operand) => hasPermission(operand, capabilities))
    : operands.some((operand) => hasPermission(operand, capabilities));
}

function fieldName(id: string): string {
  const separator = Math.max(id.lastIndexOf("."), id.lastIndexOf(":"));
  return separator < 0 ? id : id.slice(separator + 1);
}

function parameterName(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}
