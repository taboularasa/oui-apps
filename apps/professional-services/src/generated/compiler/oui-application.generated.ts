/* generated; do not edit
 * Regenerate with: python tools/semantic_compiler.py <spec> <output-dir>
 * This symbolic template contains build bindings only; application.ir.json owns semantics.
 */
import applicationIr from "./application.ir.json";

export const applicationId = "application:professional-services-conflict-decision";
export const applicationIrDigest = "sha256:1fc86cb7e3809b6e00c836b28ab80108558987451679c900dcdd0f843e4a6eac";
export const compilationId = "compile:professional-services-conflict-decision";
export const routeBindings = {
  "route:conflict-check-decision": {
    "interaction": "interaction:conflict-check-decision",
    "path": "/conflict-checks/{conflictCheckId}/decision"
  },
  "route:conflict-check-detail": {
    "interaction": "interaction:conflict-check-detail",
    "path": "/conflict-checks/{conflictCheckId}"
  }
} as const;
export const serviceBindings = {
  "service:professional-services": {
    "endpoint": "config:BFF_BASE_URL",
    "serviceType": "oui.professional_services.v1.ProfessionalServicesFrontendService"
  }
} as const;
export { applicationIr };
