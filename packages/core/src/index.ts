export const frameworkIdentity = "@oui/core" as const;

export type FrameworkIdentity = typeof frameworkIdentity;

export type {
  ApplicationDefinition,
  ApplicationMetadata,
  Cardinality,
  CommandDefinition,
  FieldDefinition,
  InteractionDefinition,
  JsonValue,
  LocalizedText,
  NavigationDefinition,
  NavigationItemDefinition,
  PathParameterDefinition,
  PermissionExpression,
  QueryDefinition,
  ResourceDefinition,
  RouteDefinition,
  SearchParameterDefinition,
  SemanticRegionDefinition,
  ServiceBindingDefinition,
  StableIdentifier,
  ValidationConstraint,
} from "./ir/types";
export {
  ApplicationIrValidationError,
  assertApplicationIr,
  defaultIrSupport,
  parseApplicationIr,
} from "./ir/validation";
export type {
  IrCompatibility,
  IrConformanceDimension,
  IrConformanceStatus,
  IrDiagnostic,
  IrDiagnosticCode,
  IrSeverity,
  IrSupport,
  IrValidationFailure,
  IrValidationResult,
  IrValidationSuccess,
} from "./ir/validation";
export { createRuntime, validateRuntimeCapabilities } from "./runtime";
export type {
  Actor,
  CapabilityRequirement,
  DiagnosticSink,
  OUIRuntime,
  RuntimeCapability,
  RuntimeClock,
  RuntimeConfiguration,
  RuntimeServices,
  SessionContext,
  TenantContext,
} from "./runtime";
export {
  ExtensionRegistrationError,
  createExtensionRegistry,
} from "./extensions";
export type {
  DefaultExtensionImplementations,
  ExtensionCatalog,
  ExtensionCategory,
  ExtensionContract,
  ExtensionIrRange,
  ExtensionLifecycle,
  ExtensionLookupFailure,
  ExtensionLookupResult,
  ExtensionLookupSuccess,
  ExtensionOrigin,
  ExtensionOverrideAuthorization,
  ExtensionRegistration,
  ExtensionRegistrationErrorCode,
  ExtensionRegistry,
  ExtensionRegistryOptions,
  ExtensionRegistryState,
} from "./extensions";
export {
  densityNames,
  semanticTokenCssVariables,
  semanticTokenNames,
} from "./theme";
export type {
  Density,
  SemanticTokenName,
  SemanticTokens,
  ThemeDefinition,
  ThemeInput,
} from "./theme";
