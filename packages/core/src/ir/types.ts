export type StableIdentifier = string;

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface LocalizedText {
  readonly id?: StableIdentifier;
  readonly fallback?: string;
  readonly arguments?: Readonly<Record<string, JsonPrimitive>>;
}

export interface Cardinality {
  readonly minimum: number;
  readonly maximum: number | null;
}

export interface PermissionExpression {
  readonly kind: "all_of" | "any_of" | "not" | "permission";
  readonly permission?: StableIdentifier;
  readonly operands?: readonly PermissionExpression[];
  readonly operand?: PermissionExpression;
}

export interface RequiredCapability {
  readonly id: StableIdentifier;
  readonly minimumVersion: string;
  readonly reason?: LocalizedText;
  readonly source?: string;
}

export interface ApplicationMetadata {
  readonly name: LocalizedText;
  readonly shortName?: LocalizedText;
  readonly description?: LocalizedText;
  readonly defaultLocale: string;
  readonly supportedLocales: readonly string[];
  readonly defaultTimeZone?: string;
}

export interface PathParameterDefinition {
  readonly id: StableIdentifier;
  readonly placeholder: string;
  readonly valueType: string;
}

export interface SearchParameterDefinition {
  readonly id: StableIdentifier;
  readonly valueType: string;
  readonly cardinality?: Cardinality;
  readonly defaultValue?: JsonValue;
}

export interface RouteDefinition {
  readonly id: StableIdentifier;
  readonly path: string;
  readonly interaction: StableIdentifier;
  readonly title?: LocalizedText;
  readonly pathParameters: readonly PathParameterDefinition[];
  readonly searchParameters: readonly SearchParameterDefinition[];
  readonly parent?: StableIdentifier;
  readonly requiredPermissions?: PermissionExpression;
  readonly unknownSearchParameters?: "discard" | "preserve" | "reject";
  readonly presentation?: Readonly<Record<string, JsonValue>>;
  readonly provenance?: Readonly<Record<string, JsonValue>>;
}

export interface NavigationItemDefinition {
  readonly id: StableIdentifier;
  readonly label: LocalizedText;
  readonly route?: StableIdentifier;
  readonly children: readonly NavigationItemDefinition[];
  readonly requiredPermissions?: PermissionExpression;
  readonly iconHint?: string;
}

export interface NavigationDefinition {
  readonly items: readonly NavigationItemDefinition[];
  readonly landmarkLabel: LocalizedText;
}

export interface ValidationConstraint {
  readonly id: StableIdentifier;
  readonly kind: string;
  readonly message: LocalizedText;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly timing: "blur" | "input" | "server" | "submit";
  readonly severity: "error" | "warning";
  readonly condition?: Readonly<Record<string, JsonValue>>;
}

export interface FieldDefinition {
  readonly id: StableIdentifier;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  readonly valueType: string;
  readonly valueTypeParameters?: Readonly<Record<string, JsonValue>>;
  readonly cardinality: Cardinality;
  readonly readOnly: boolean;
  readonly validation: readonly ValidationConstraint[];
  readonly defaultValue?: JsonValue;
  readonly sensitivity?: string;
  readonly requiredPermissions?: PermissionExpression;
  readonly presentation?: Readonly<Record<string, JsonValue>>;
}

export interface StateDefinition {
  readonly id: StableIdentifier;
  readonly label: LocalizedText;
  readonly terminal: boolean;
  readonly statusRole?:
    | "critical"
    | "inactive"
    | "informative"
    | "neutral"
    | "positive"
    | "warning";
}

export interface RelationshipDefinition {
  readonly id: StableIdentifier;
  readonly label: LocalizedText;
  /**
   * Field of the SUBJECT resource that displays the relationship. A to-one
   * relationship has one; a to-many has none, because no single field of the
   * parent can stand for a collection of children.
   */
  readonly field?: StableIdentifier;
  readonly target: StableIdentifier;
  readonly cardinality: Cardinality;
  /** Route that resolves the related resource, when it can be followed. */
  readonly route?: string;
  /** Path parameter the route consumes; defaults to the route's own. */
  readonly routeParameter?: string;
  /** Field carrying the value the route needs, when it differs from `field`. */
  readonly identityField?: string;
  /**
   * Where the related records live in the detail response. Required for a
   * to-many relationship, which renders the children themselves rather than a
   * value projected onto the parent.
   */
  readonly itemsPath?: string;
  /** Field of the TARGET resource that labels each related record. */
  readonly itemLabelField?: StableIdentifier;
  /** Route each related record links to. */
  readonly itemRoute?: string;
  /** Field of the TARGET resource carrying the value `itemRoute` consumes. */
  readonly itemIdentityField?: StableIdentifier;
}

/** True when a relationship holds many related records rather than one. */
export function isToMany(relationship: RelationshipDefinition): boolean {
  return (
    relationship.cardinality.maximum === null ||
    relationship.cardinality.maximum > 1
  );
}

export interface ResourceDefinition {
  readonly id: StableIdentifier;
  readonly label: LocalizedText;
  readonly pluralLabel: LocalizedText;
  readonly identityField: StableIdentifier;
  readonly fields: Readonly<Record<StableIdentifier, FieldDefinition>>;
  readonly states: Readonly<Record<StableIdentifier, StateDefinition>>;
  readonly relationships: Readonly<
    Record<StableIdentifier, RelationshipDefinition>
  >;
  readonly display?: {
    readonly titleField?: StableIdentifier;
    readonly summaryFields?: readonly StableIdentifier[];
  };
  readonly provenance?: Readonly<Record<string, JsonValue>>;
}

export interface ServiceBindingDefinition {
  readonly id: StableIdentifier;
  readonly protocol: "connect";
  readonly serviceType: string;
  readonly endpoint: string;
  readonly capabilities: readonly (
    "bidirectional_stream" | "client_stream" | "server_stream" | "unary"
  )[];
}

export interface ValueBinding {
  readonly source: string;
  readonly parameter?: StableIdentifier;
  readonly field?: StableIdentifier;
  readonly query?: StableIdentifier;
  readonly path?: string;
  readonly value?: JsonValue;
}

export interface OperationInput {
  readonly bindings: Readonly<Record<string, ValueBinding>>;
}

export interface OperationOutput {
  readonly resource: StableIdentifier;
  readonly itemPath?: string;
  readonly itemsPath?: string;
  readonly evidencePath?: string;
  readonly alternativesPath?: string;
  readonly operationPath?: string;
  readonly auditIdPath?: string;
}

export interface QueryDefinition {
  readonly id: StableIdentifier;
  readonly service: StableIdentifier;
  readonly method: string;
  readonly input: OperationInput;
  readonly output: OperationOutput;
  readonly cache: Readonly<Record<string, JsonValue>>;
  readonly pagination?: Readonly<Record<string, JsonValue>>;
  readonly streaming?: Readonly<Record<string, JsonValue>>;
  readonly requiredPermissions?: PermissionExpression;
}

export interface CommandDefinition {
  readonly id: StableIdentifier;
  readonly service: StableIdentifier;
  readonly method: string;
  readonly input: OperationInput;
  readonly output: OperationOutput;
  readonly idempotency: "prohibited" | "required" | "supported";
  readonly consequence: "compensatable" | "irreversible" | "reversible";
  readonly invalidates: readonly StableIdentifier[];
  readonly requiredPermissions?: PermissionExpression;
  readonly confirmation?: Readonly<Record<string, JsonValue>>;
  readonly progress?: Readonly<Record<string, JsonValue>>;
}

export interface SemanticRegionDefinition {
  readonly id: StableIdentifier;
  readonly kind: string;
  readonly required: boolean;
  readonly fields?: readonly StableIdentifier[];
  readonly relationships?: readonly StableIdentifier[];
  readonly sourceField?: StableIdentifier;
  readonly sourcePath?: string;
}

export interface CollectionInteractionDefinition {
  readonly query: StableIdentifier;
  readonly visibleFields: readonly StableIdentifier[];
  readonly identityField: StableIdentifier;
  readonly filters: readonly Readonly<Record<string, JsonValue>>[];
  readonly sorting: Readonly<Record<string, JsonValue>>;
  readonly grouping: Readonly<Record<string, JsonValue>>;
  readonly pagination: Readonly<Record<string, JsonValue>>;
  readonly selection: Cardinality;
  readonly emptyState: Readonly<Record<string, JsonValue>>;
  readonly itemRoute?: StableIdentifier;
}

export interface DetailInteractionDefinition {
  readonly query: StableIdentifier;
  readonly titleField: StableIdentifier;
  readonly editRoute?: StableIdentifier;
}

export interface FormInteractionDefinition {
  readonly mode: "create" | "edit";
  readonly initialValues: Readonly<Record<string, JsonValue>>;
  readonly fields: readonly StableIdentifier[];
  readonly submitCommand: StableIdentifier;
  readonly validation: Readonly<Record<string, JsonValue>>;
  readonly success: Readonly<Record<string, JsonValue>>;
  readonly cancelRoute?: StableIdentifier;
  readonly unsavedChanges?: string;
}

export interface DecisionInteractionDefinition {
  readonly query: StableIdentifier;
  readonly subjectPath: string;
  readonly evidence: Readonly<Record<string, JsonValue>>;
  readonly alternatives: readonly Readonly<Record<string, JsonValue>>[];
  readonly preconditions: readonly Readonly<Record<string, JsonValue>>[];
  readonly outcome: Readonly<Record<string, JsonValue>>;
  readonly conflictRecovery?: Readonly<Record<string, JsonValue>>;
}

export type InteractionKind = "collection" | "decision" | "detail" | "form";

export interface InteractionDefinition {
  readonly id: StableIdentifier;
  readonly kind: InteractionKind;
  readonly intent: StableIdentifier;
  readonly label: LocalizedText;
  readonly subject?: StableIdentifier;
  readonly queries: readonly StableIdentifier[];
  readonly commands: readonly StableIdentifier[];
  readonly requiredPermissions?: PermissionExpression;
  readonly regions: readonly SemanticRegionDefinition[];
  readonly states?: Readonly<Record<string, JsonValue>>;
  readonly presentation?: Readonly<Record<string, JsonValue>>;
  readonly provenance?: Readonly<Record<string, JsonValue>>;
  readonly collection?: CollectionInteractionDefinition;
  readonly detail?: DetailInteractionDefinition;
  readonly form?: FormInteractionDefinition;
  readonly decision?: DecisionInteractionDefinition;
}

export interface PresentationDefinition {
  readonly theme: {
    readonly capability: StableIdentifier;
    readonly minimumVersion: string;
  };
  readonly density: string;
  readonly locale: string;
  readonly shell: {
    readonly regions: readonly SemanticRegionDefinition[];
    readonly skipLink: LocalizedText;
  };
}

export interface PermissionDefinition {
  readonly id: StableIdentifier;
  readonly label: LocalizedText;
}

export interface ApplicationDefinition {
  readonly id: StableIdentifier;
  readonly irVersion: string;
  readonly requiredCapabilities: readonly RequiredCapability[];
  readonly metadata: ApplicationMetadata;
  readonly routes: Readonly<Record<StableIdentifier, RouteDefinition>>;
  readonly navigation: NavigationDefinition;
  readonly resources: Readonly<Record<StableIdentifier, ResourceDefinition>>;
  readonly queries: Readonly<Record<StableIdentifier, QueryDefinition>>;
  readonly commands: Readonly<Record<StableIdentifier, CommandDefinition>>;
  readonly interactions: Readonly<
    Record<StableIdentifier, InteractionDefinition>
  >;
  readonly serviceBindings: Readonly<
    Record<StableIdentifier, ServiceBindingDefinition>
  >;
  readonly presentation: PresentationDefinition;
  readonly permissions?: {
    readonly definitions: Readonly<
      Record<StableIdentifier, PermissionDefinition>
    >;
  };
  readonly provenance?: Readonly<Record<string, JsonValue>>;
}
