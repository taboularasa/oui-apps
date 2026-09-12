import type {
  ApplicationDefinition,
  CommandDefinition,
  FieldDefinition,
  InteractionDefinition,
  PermissionExpression,
  SessionContext,
  ValidationConstraint,
} from "@oui/core";
import type { OUIOperationError } from "@oui/data";

export type FormFieldKind =
  "boolean" | "date" | "enum" | "number" | "relationship" | "text";

export interface FormOption {
  readonly id: string;
  readonly label: string;
}

export interface CompiledFormField {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly kind: FormFieldKind;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly hidden: boolean;
  readonly unavailable: boolean;
  readonly options: readonly FormOption[];
  readonly definition: FieldDefinition;
}

export interface CompiledForm {
  readonly interaction: InteractionDefinition;
  readonly fields: readonly CompiledFormField[];
  readonly command: CommandDefinition;
  readonly unsavedChanges: string;
}

export interface CompileFormOptions {
  readonly application: ApplicationDefinition;
  readonly interaction: InteractionDefinition;
  readonly session: SessionContext;
  readonly relationshipOptions?: Readonly<
    Record<string, readonly FormOption[]>
  >;
}

export interface ServerValidationResult {
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly formError?: string;
}

export function compileForm({
  application,
  interaction,
  session,
  relationshipOptions = {},
}: CompileFormOptions): CompiledForm {
  if (interaction.kind !== "form" || interaction.form === undefined) {
    throw new Error(`Interaction ${interaction.id} is not a form.`);
  }
  if (interaction.subject === undefined) {
    throw new Error(`Form ${interaction.id} has no subject resource.`);
  }
  const resource = application.resources[interaction.subject];
  if (resource === undefined) {
    throw new Error(
      `Form ${interaction.id} references unknown resource ${interaction.subject}.`,
    );
  }
  const command = application.commands[interaction.form.submitCommand];
  if (command === undefined) {
    throw new Error(
      `Form ${interaction.id} references unknown command ${interaction.form.submitCommand}.`,
    );
  }

  const fields = interaction.form.fields.map((fieldId) => {
    const definition = resource.fields[fieldId];
    if (definition === undefined) {
      throw new Error(
        `Form ${interaction.id} references unknown field ${fieldId}.`,
      );
    }
    return compileField(
      definition,
      session,
      relationshipOptions[fieldId] ?? [],
    );
  });

  return Object.freeze({
    interaction,
    fields: Object.freeze(fields),
    command,
    unsavedChanges: interaction.form.unsavedChanges ?? "allow",
  });
}

export function normalizeInitialValues(
  fields: readonly CompiledFormField[],
  initialValues: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        initialValues[field.id] ??
          initialValues[field.name] ??
          defaultValue(field),
      ]),
    ),
  );
}

export function validateFormValues(
  fields: readonly CompiledFormField[],
  values: Readonly<Record<string, unknown>>,
  timing: "blur" | "input" | "submit",
  onlyField?: string,
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (
      field.hidden ||
      field.readOnly ||
      field.unavailable ||
      (onlyField !== undefined && field.name !== onlyField)
    ) {
      continue;
    }
    const constraints = field.definition.validation.filter(
      (constraint) =>
        constraint.timing !== "server" &&
        (timing === "submit" || constraint.timing === timing),
    );
    for (const constraint of constraints) {
      if (!satisfiesConstraint(constraint, values[field.name])) {
        errors[field.name] =
          constraint.message.fallback ??
          constraint.message.id ??
          `Invalid ${field.label}.`;
        break;
      }
    }
    if (
      errors[field.name] === undefined &&
      field.required &&
      isEmpty(values[field.name])
    ) {
      errors[field.name] = `Enter ${field.label.toLocaleLowerCase()}.`;
    }
  }

  return Object.freeze(errors);
}

export function mapServerValidation(
  error: OUIOperationError,
  fields: readonly CompiledFormField[],
): ServerValidationResult {
  const details =
    typeof error.details === "object" && error.details !== null
      ? (error.details as { readonly violations?: readonly unknown[] })
      : undefined;
  const violations = details?.violations;
  if (error.kind !== "validation" || violations === undefined) {
    return Object.freeze({
      fieldErrors: Object.freeze({}),
      formError: error.message,
    });
  }

  const fieldErrors: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const violation of violations) {
    if (typeof violation !== "object" || violation === null) {
      continue;
    }
    const candidate = violation as {
      readonly fieldPath?: string;
      readonly field_path?: string;
      readonly message?: string;
      readonly reason?: string;
    };
    const path = candidate.fieldPath ?? candidate.field_path ?? "";
    const field = fields.find(
      ({ name, id }) =>
        path === name || path.endsWith(`.${name}`) || path === id,
    );
    const message =
      candidate.message ?? candidate.reason ?? "The value was not accepted.";
    if (field === undefined) {
      unmatched.push(message);
    } else {
      fieldErrors[field.name] = message;
    }
  }

  return Object.freeze({
    fieldErrors: Object.freeze(fieldErrors),
    ...(unmatched.length === 0 ? {} : { formError: unmatched.join(" ") }),
  });
}

export function materializeCommandInput(
  command: CommandDefinition,
  fields: readonly CompiledFormField[],
  values: Readonly<Record<string, unknown>>,
  initialValues: Readonly<Record<string, unknown>>,
  routeParameters: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const changedFields = fields.filter(
    ({ name, readOnly }) =>
      !readOnly && !Object.is(values[name], initialValues[name]),
  );
  const changes = Object.fromEntries(
    changedFields.map(({ name }) => [name, values[name]]),
  );

  return Object.freeze(
    Object.fromEntries(
      Object.entries(command.input.bindings).map(([target, binding]) => {
        if (binding.source === "literal") {
          return [target, binding.value];
        }
        if (binding.source === "route") {
          return [
            target,
            routeParameters[parameterName(binding.parameter ?? "")],
          ];
        }
        if (binding.source === "initial") {
          const field = fields.find(({ id }) => id === binding.field);
          const name =
            field?.name ??
            parameterName(binding.field?.replace(".", ":") ?? "");
          return [
            target,
            initialValues[name] ?? initialValues[binding.field ?? ""],
          ];
        }
        if (binding.source === "form") {
          return [target, changes];
        }
        if (binding.source === "dirty_fields") {
          return [target, changedFields.map(({ name }) => name)];
        }
        return [target, undefined];
      }),
    ),
  );
}

function compileField(
  definition: FieldDefinition,
  session: SessionContext,
  relationshipOptions: readonly FormOption[],
): CompiledFormField {
  const kind = fieldKind(definition.valueType);
  const enumValues =
    kind === "enum" && Array.isArray(definition.valueTypeParameters?.values)
      ? definition.valueTypeParameters.values
          .filter((value): value is string => typeof value === "string")
          .map((value) => ({ id: value, label: humanize(value) }))
      : [];
  const description =
    definition.description?.fallback ?? definition.description?.id;

  return Object.freeze({
    id: definition.id,
    name: fieldName(definition.id),
    label: definition.label.fallback ?? definition.label.id ?? definition.id,
    ...(description === undefined ? {} : { description }),
    kind,
    required: definition.cardinality.minimum > 0,
    readOnly: definition.readOnly,
    hidden: definition.presentation?.hidden === true,
    unavailable: !hasPermission(
      definition.requiredPermissions,
      session.capabilities,
    ),
    options:
      kind === "enum"
        ? Object.freeze(enumValues)
        : kind === "relationship"
          ? Object.freeze([...relationshipOptions])
          : Object.freeze([]),
    definition,
  });
}

function fieldKind(valueType: string): FormFieldKind {
  if (["decimal", "integer", "number"].includes(valueType)) {
    return "number";
  }
  if (valueType === "boolean") {
    return "boolean";
  }
  if (valueType === "enum") {
    return "enum";
  }
  if (valueType === "date" || valueType === "dateTime") {
    return "date";
  }
  if (valueType === "reference") {
    return "relationship";
  }
  return "text";
}

function defaultValue(field: CompiledFormField): unknown {
  if (field.definition.defaultValue !== undefined) {
    return field.definition.defaultValue;
  }
  return field.kind === "boolean" ? false : "";
}

function satisfiesConstraint(
  constraint: ValidationConstraint,
  value: unknown,
): boolean {
  if (constraint.kind === "required") {
    return !isEmpty(value);
  }
  if (constraint.kind === "minimum_length") {
    const minimum = constraint.parameters.minimum;
    return (
      typeof value === "string" &&
      typeof minimum === "number" &&
      value.length >= minimum
    );
  }
  if (constraint.kind === "allowed_values") {
    const values = constraint.parameters.values;
    return Array.isArray(values) && values.includes(value as never);
  }
  return true;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function fieldName(id: string): string {
  return id.includes(".")
    ? id.slice(id.lastIndexOf(".") + 1)
    : parameterName(id);
}

function parameterName(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
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
