export const formPatternContract = "oui.form-pattern@1" as const;

export {
  compileForm,
  mapServerValidation,
  materializeCommandInput,
  normalizeInitialValues,
  validateFormValues,
} from "./compiler";
export type {
  CompileFormOptions,
  CompiledForm,
  CompiledFormField,
  FormFieldKind,
  FormOption,
  ServerValidationResult,
} from "./compiler";
export { IRDrivenForm } from "./form";
export type { FormSubmissionState, IRDrivenFormProps } from "./form";
