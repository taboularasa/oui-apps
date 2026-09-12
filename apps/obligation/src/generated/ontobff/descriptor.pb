
æ8
!oui/obligation/v1/reference.protooui.obligation.v1"
GetCompatibilityRequest"ı
GetCompatibilityResponse%
application_id (	RapplicationId

ir_version (	R	irVersion
	ir_digest (	RirDigest&
bff_plan_digest (	RbffPlanDigest+
descriptor_digest (	RdescriptorDigest.
generated_go_digest (	RgeneratedGoDigest%
connect_digest (	RconnectDigest+
generator_version (	RgeneratorVersion'
runtime_version	 (	RruntimeVersion'
manifest_digest
 (	RmanifestDigest'
contract_digest (	RcontractDigest"
capabilities (	Rcapabilities"
GetSessionRequest"ù
GetSessionResponse.
actor (2.oui.obligation.v1.ActorRactor"
capabilities (	Rcapabilities
locale (	Rlocale
	time_zone (	RtimeZone":
Actor
id (	Rid!
display_name (	RdisplayName"ß
Asset
id (	Rid
name (	Rname
category (	Rcategory
customer_id (	R
customerId
version (	Rversion#
customer_name (	RcustomerName"Í

Obligation
id (	Rid
name (	Rname
asset_id (	RassetId"
next_due_date (	RnextDueDate#
interval_days (RintervalDays
version (	Rversion
	due_state (	RdueState

asset_name (	R	assetName"´
Proof
id (	Rid#
obligation_id (	RobligationId
name (	Rname
required (Rrequired#
captured_date (	RcapturedDate
version (	Rversion"Ç
ObligationException
id (	Rid#
obligation_id (	RobligationId
status (	Rstatus
next_action (	R
nextAction
owner_id (	RownerId
raised_date (	R
raisedDate
version (	Rversion'
obligation_name (	RobligationName"≥
ListAssetsRequest
category (	Rcategory

page_token (	R	pageToken
	page_size (RpageSize
query (	Rquery
sort (	Rsort
	direction (	R	direction"n
ListAssetsResponse0
assets (2.oui.obligation.v1.AssetRassets&
next_page_token (	RnextPageToken"ñ
GetAssetRequest
asset_id (	RassetId4
obligations_page_token (	RobligationsPageToken2
obligations_page_size (RobligationsPageSize"¬
GetAssetResponse.
asset (2.oui.obligation.v1.AssetRasset?
obligations (2.oui.obligation.v1.ObligationRobligations=
obligations_next_page_token (	RobligationsNextPageToken"æ
ListObligationsRequest
asset_id (	RassetId
	due_state (	RdueState

page_token (	R	pageToken
	page_size (RpageSize
sort (	Rsort
	direction (	R	direction"Ç
ListObligationsResponse?
obligations (2.oui.obligation.v1.ObligationRobligations&
next_page_token (	RnextPageToken"ë
GetObligationRequest#
obligation_id (	RobligationId*
proofs_page_token (	RproofsPageToken(
proofs_page_size (RproofsPageSize"≠
GetObligationResponse=

obligation (2.oui.obligation.v1.ObligationR
obligation.
asset (2.oui.obligation.v1.AssetRasset0
proofs (2.oui.obligation.v1.ProofRproofs>
outstanding_required_proofs (RoutstandingRequiredProofs3
proofs_next_page_token (	RproofsNextPageToken"¬
ListExceptionsRequest
status (	Rstatus#
obligation_id (	RobligationId

page_token (	R	pageToken
	page_size (RpageSize
sort (	Rsort
	direction (	R	direction"à
ListExceptionsResponseF

exceptions (2&.oui.obligation.v1.ObligationExceptionR
exceptions&
next_page_token (	RnextPageToken"é
GetExceptionRequest!
exception_id (	RexceptionId*
proofs_page_token (	RproofsPageToken(
proofs_page_size (RproofsPageSize"¬
GetExceptionResponseD
	exception (2&.oui.obligation.v1.ObligationExceptionR	exception=

obligation (2.oui.obligation.v1.ObligationR
obligation0
proofs (2.oui.obligation.v1.ProofRproofs>
outstanding_required_proofs (RoutstandingRequiredProofs3
proofs_next_page_token (	RproofsNextPageToken"ñ
CaptureProofRequest
proof_id (	RproofId)
expected_version (	RexpectedVersion9
capture (2.oui.obligation.v1.ProofCaptureRcapture"3
ProofCapture#
captured_date (	RcapturedDate"a
CaptureProofResponse.
proof (2.oui.obligation.v1.ProofRproof
audit_id (	RauditId"q
ExceptionDraft#
obligation_id (	RobligationId
next_action (	R
nextAction
owner_id (	RownerId"P
RaiseExceptionRequest7
draft (2!.oui.obligation.v1.ExceptionDraftRdraft"y
RaiseExceptionResponseD
	exception (2&.oui.obligation.v1.ObligationExceptionR	exception
audit_id (	RauditId"K
ExceptionClosure
status (	Rstatus
next_action (	R
nextAction"≈
CloseExceptionRequest!
exception_id (	RexceptionId)
expected_version (	RexpectedVersion=
closure (2#.oui.obligation.v1.ExceptionClosureRclosure
update_mask (	R
updateMask"y
CloseExceptionResponseD
	exception (2&.oui.obligation.v1.ObligationExceptionR	exception
audit_id (	RauditId"_
ValidationErrorDetailF

violations (2&.oui.obligation.v1.ValidationViolationR
violations"¡
ValidationViolation

field_path (	R	fieldPath#
constraint_id (	RconstraintId
reason (	Rreason
message (	Rmessage4
rejected_value_display (	RrejectedValueDisplay"ÿ
PermissionErrorDetail/
required_capability (	RrequiredCapability
reason (	Rreason 
explanation (	Rexplanation-
remediation_action (	RremediationAction%
correlation_id (	RcorrelationId"{
ConflictErrorDetail
reason (	Rreason%
conflicting_id (	RconflictingId%
correlation_id (	RcorrelationId"Æ
StaleStateDetail
resource_id (	R
resourceId)
expected_version (	RexpectedVersion'
current_version (	RcurrentVersion%
refresh_action (	RrefreshAction"â
PreconditionErrorDetail
reason (	Rreason/
unmet_preconditions (	RunmetPreconditions%
correlation_id (	RcorrelationId"ç
OperationErrorDetail
reason (	Rreason
message (	Rmessage
	retryable (R	retryable%
correlation_id (	RcorrelationId2ÿ
ObligationFrontendServicek
GetCompatibility*.oui.obligation.v1.GetCompatibilityRequest+.oui.obligation.v1.GetCompatibilityResponseY

GetSession$.oui.obligation.v1.GetSessionRequest%.oui.obligation.v1.GetSessionResponseY

ListAssets$.oui.obligation.v1.ListAssetsRequest%.oui.obligation.v1.ListAssetsResponseS
GetAsset".oui.obligation.v1.GetAssetRequest#.oui.obligation.v1.GetAssetResponseh
ListObligations).oui.obligation.v1.ListObligationsRequest*.oui.obligation.v1.ListObligationsResponseb
GetObligation'.oui.obligation.v1.GetObligationRequest(.oui.obligation.v1.GetObligationResponsee
ListExceptions(.oui.obligation.v1.ListExceptionsRequest).oui.obligation.v1.ListExceptionsResponse_
GetException&.oui.obligation.v1.GetExceptionRequest'.oui.obligation.v1.GetExceptionResponse_
CaptureProof&.oui.obligation.v1.CaptureProofRequest'.oui.obligation.v1.CaptureProofResponsee
RaiseException(.oui.obligation.v1.RaiseExceptionRequest).oui.obligation.v1.RaiseExceptionResponsee
CloseException(.oui.obligation.v1.CloseExceptionRequest).oui.obligation.v1.CloseExceptionResponseBVZTgithub.com/taboularasa/ontobff/apps/obligation/gen/go/oui/obligation/v1;obligationv1bproto3