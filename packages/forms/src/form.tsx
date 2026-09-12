import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useForm } from "@tanstack/react-form";
import type {
  ApplicationDefinition,
  InteractionDefinition,
  SessionContext,
} from "@oui/core";
import {
  OUIOperationError,
  createIdempotencyIdentityStore,
  type OUIOperationRuntime,
} from "@oui/data";
import {
  Button,
  Checkbox,
  Feedback,
  Field,
  Inline,
  Selection,
  Stack,
  Status,
} from "@oui/react-aria";
import {
  compileForm,
  mapServerValidation,
  materializeCommandInput,
  normalizeInitialValues,
  validateFormValues,
  type CompiledFormField,
  type FormOption,
} from "./compiler";

export type FormSubmissionState =
  "dirty" | "failed" | "idle" | "submitting" | "success";

export interface IRDrivenFormProps {
  readonly application: ApplicationDefinition;
  readonly interaction: InteractionDefinition;
  readonly session: SessionContext;
  readonly operationRuntime: OUIOperationRuntime;
  readonly initialValues: Readonly<Record<string, unknown>>;
  readonly routeParameters?: Readonly<Record<string, unknown>>;
  readonly relationshipOptions?: Readonly<
    Record<string, readonly FormOption[]>
  >;
  readonly confirmDiscard?: () => boolean | Promise<boolean>;
  readonly onCancel?: () => void;
  readonly onSuccess?: (output: unknown) => void;
}

export function IRDrivenForm({
  application,
  interaction,
  session,
  operationRuntime,
  initialValues,
  routeParameters = {},
  relationshipOptions = {},
  confirmDiscard = () => true,
  onCancel,
  onSuccess,
}: IRDrivenFormProps): ReactElement {
  const compiled = useMemo(
    () =>
      compileForm({
        application,
        interaction,
        session,
        relationshipOptions,
      }),
    [application, interaction, relationshipOptions, session],
  );
  const defaults = useMemo(
    () => normalizeInitialValues(compiled.fields, initialValues),
    [compiled.fields, initialValues],
  );
  const [fieldErrors, setFieldErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [formError, setFormError] = useState<string>();
  const [submissionState, setSubmissionState] =
    useState<FormSubmissionState>("idle");
  const [dirty, setDirty] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const idempotency = useRef(createIdempotencyIdentityStore());

  const focusErrors = () => {
    queueMicrotask(() => {
      errorSummary.current?.focus();
    });
  };

  const form = useForm({
    defaultValues: defaults,
    onSubmit: async ({ value }) => {
      const errors = validateFormValues(compiled.fields, value, "submit");
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setFormError("Correct the highlighted fields and submit again.");
        setSubmissionState("failed");
        focusErrors();
        return;
      }

      setFieldErrors({});
      setFormError(undefined);
      setSubmissionState("submitting");
      const input = materializeCommandInput(
        compiled.command,
        compiled.fields,
        value,
        { ...initialValues, ...defaults },
        routeParameters,
      );
      const idempotencyKey =
        compiled.command.idempotency === "prohibited"
          ? undefined
          : idempotency.current.forInput(compiled.command.id, input);
      try {
        const output = await operationRuntime.command(
          compiled.command.id,
          input,
          idempotencyKey === undefined ? {} : { idempotencyKey },
        );
        if (idempotencyKey !== undefined) {
          idempotency.current.complete(compiled.command.id, input);
        }
        setSubmissionState("success");
        setDirty(false);
        form.reset(value);
        onSuccess?.(output);
      } catch (cause) {
        const error =
          cause instanceof OUIOperationError
            ? cause
            : new OUIOperationError({
                kind: "internal",
                operationId: compiled.command.id,
                message:
                  cause instanceof Error
                    ? cause.message
                    : "The form could not be submitted.",
                retryable: false,
              });
        const mapped = mapServerValidation(error, compiled.fields);
        setFieldErrors(mapped.fieldErrors);
        setFormError(
          mapped.formError ??
            (Object.keys(mapped.fieldErrors).length > 0
              ? "Correct the highlighted fields and submit again."
              : error.message),
        );
        setSubmissionState("failed");
        focusErrors();
      }
    },
  });

  useEffect(() => {
    if (!dirty || compiled.unsavedChanges === "allow") {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [compiled.unsavedChanges, dirty]);

  const cancel = async () => {
    if (
      dirty &&
      compiled.unsavedChanges === "confirm_discard" &&
      !(await confirmDiscard())
    ) {
      return;
    }
    form.reset();
    setDirty(false);
    setFieldErrors({});
    setFormError(undefined);
    setSubmissionState("idle");
    onCancel?.();
  };

  return (
    <form
      aria-label={
        compiled.interaction.label.fallback ??
        compiled.interaction.label.id ??
        "Form"
      }
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Stack gap="section">
        {formError === undefined &&
        Object.keys(fieldErrors).length === 0 ? null : (
          <div
            aria-label="Form errors"
            ref={errorSummary}
            role="alert"
            tabIndex={-1}
          >
            <h2>There is a problem</h2>
            {formError === undefined ? null : <p>{formError}</p>}
            <ul>
              {Object.entries(fieldErrors).map(([name, message]) => (
                <li key={name}>
                  <a href={`#oui-field-${name}`}>{message}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {compiled.fields.map((field) => {
          if (field.hidden) {
            return null;
          }
          if (field.unavailable) {
            return (
              <Feedback key={field.id} kind="warning">
                {field.label} is unavailable for the current account.
              </Feedback>
            );
          }
          return (
            <form.Field key={field.id} name={field.name}>
              {(controller) => (
                <div
                  data-oui-form-field={field.name}
                  id={`oui-field-${field.name}`}
                  onBlur={() => {
                    controller.handleBlur();
                    const errors = validateFormValues(
                      compiled.fields,
                      form.state.values,
                      "blur",
                      field.name,
                    );
                    setFieldErrors((current) => {
                      const next = { ...current };
                      const error = errors[field.name];
                      if (error === undefined) {
                        delete next[field.name];
                      } else {
                        next[field.name] = error;
                      }
                      return next;
                    });
                  }}
                >
                  <FormControl
                    {...(fieldErrors[field.name] === undefined
                      ? {}
                      : { error: fieldErrors[field.name] })}
                    field={field}
                    onChange={(value) => {
                      controller.handleChange(value);
                      setDirty(true);
                      setSubmissionState("dirty");
                      setFormError(undefined);
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next[field.name];
                        return next;
                      });
                    }}
                    value={controller.state.value}
                  />
                </div>
              )}
            </form.Field>
          );
        })}

        <form.Subscribe
          selector={(state) => [state.isSubmitting, state.canSubmit] as const}
        >
          {([isSubmitting, canSubmit]) => (
            <Inline>
              <Button busy={isSubmitting} disabled={!canSubmit} type="submit">
                Save
              </Button>
              <Button
                onAction={() => {
                  void cancel();
                }}
              >
                Cancel
              </Button>
            </Inline>
          )}
        </form.Subscribe>

        <Status busy={submissionState === "submitting"} label="Form status">
          {submissionMessage(submissionState, dirty)}
        </Status>
      </Stack>
    </form>
  );
}

function FormControl({
  field,
  value,
  error,
  onChange,
}: {
  readonly field: CompiledFormField;
  readonly value: unknown;
  readonly error?: string;
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  if (field.kind === "boolean") {
    return (
      <Checkbox
        label={field.label}
        onChange={onChange}
        readOnly={field.readOnly}
        selected={Boolean(value)}
      />
    );
  }
  if (field.kind === "enum" || field.kind === "relationship") {
    return (
      <Selection
        {...(field.description === undefined
          ? {}
          : { description: field.description })}
        disabled={field.readOnly}
        {...(error === undefined ? {} : { errorMessage: error })}
        invalid={error !== undefined}
        label={field.label}
        onSelectionChange={onChange}
        options={field.options}
        selectedKey={typeof value === "string" ? value : ""}
      />
    );
  }

  return (
    <Field
      {...(field.description === undefined
        ? {}
        : { description: field.description })}
      {...(error === undefined ? {} : { errorMessage: error })}
      inputType={
        field.kind === "number"
          ? "number"
          : field.kind === "date"
            ? field.definition.valueType === "dateTime"
              ? "datetime-local"
              : "date"
            : "text"
      }
      invalid={error !== undefined}
      label={field.label}
      onChange={(next) => {
        onChange(field.kind === "number" && next !== "" ? Number(next) : next);
      }}
      readOnly={field.readOnly}
      required={field.required}
      value={
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : ""
      }
    />
  );
}

function submissionMessage(state: FormSubmissionState, dirty: boolean): string {
  if (state === "submitting") {
    return "Saving changes";
  }
  if (state === "success") {
    return "Changes saved";
  }
  if (state === "failed") {
    return "Changes were not saved";
  }
  return dirty ? "Unsaved changes" : "No unsaved changes";
}
