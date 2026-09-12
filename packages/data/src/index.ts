export const dataRuntimeContract = "oui.data-runtime@1" as const;

export { OUIOperationError, mapOperationError } from "./errors";
export type {
  ConnectFailureDetail,
  ConnectFailureShape,
  OUIOperationErrorKind,
} from "./errors";
export { createOperationHeaders, createOperationRuntime } from "./runtime";
export type {
  CommandOptions,
  CreateOperationHeadersOptions,
  CreateOperationRuntimeOptions,
  OUIOperationRuntime,
  OperationMetadata,
  OperationMetadataProvider,
  OperationContractIdentity,
  OperationOptions,
} from "./runtime";
export { createIdempotencyIdentityStore } from "./idempotency";
export type { IdempotencyIdentityStore } from "./idempotency";
export {
  TestConnectClient,
  createConnectClientRegistry,
  createGeneratedConnectClient,
} from "./transport";
export type {
  ConnectClientRegistration,
  ConnectClientRegistry,
  ConnectServerStreamRequest,
  ConnectUnaryRequest,
  GeneratedConnectClient,
  GeneratedConnectServerStreamMethod,
  GeneratedConnectUnaryMethod,
  TestConnectStreamHandler,
  TestConnectHandler,
} from "./transport";
