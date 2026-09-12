/* generated; do not edit
 * Regenerate with: python tools/semantic_compiler.py <spec> <output-dir>
 * This symbolic template contains build bindings only; application.ir.json owns semantics.
 */
import applicationIr from "./application.ir.json";

export const applicationId = "application:obligation-register";
export const applicationIrDigest = "sha256:09074a83dc7826fc998fbdbaf39e34a3fbbc7f023e4ad8ccc6ad5c19b2fdcc36";
export const compilationId = "compile:obligation-register";
export const routeBindings = {
  "route:asset-detail": {
    "interaction": "interaction:asset-detail",
    "path": "/assets/{assetId}"
  },
  "route:assets": {
    "interaction": "interaction:asset-collection",
    "path": "/assets"
  },
  "route:exception-close": {
    "interaction": "interaction:exception-close",
    "path": "/exceptions/{exceptionId}/close"
  },
  "route:exception-detail": {
    "interaction": "interaction:exception-detail",
    "path": "/exceptions/{exceptionId}"
  },
  "route:exception-raise": {
    "interaction": "interaction:exception-raise",
    "path": "/exceptions/new"
  },
  "route:exceptions": {
    "interaction": "interaction:exception-collection",
    "path": "/exceptions"
  },
  "route:obligation-detail": {
    "interaction": "interaction:obligation-detail",
    "path": "/obligations/{obligationId}"
  },
  "route:obligations": {
    "interaction": "interaction:obligation-collection",
    "path": "/obligations"
  },
  "route:proof-capture": {
    "interaction": "interaction:proof-capture",
    "path": "/proofs/{proofId}/capture"
  }
} as const;
export const serviceBindings = {
  "service:obligation": {
    "endpoint": "config:BFF_BASE_URL",
    "serviceType": "oui.obligation.v1.ObligationFrontendService"
  }
} as const;
export { applicationIr };
