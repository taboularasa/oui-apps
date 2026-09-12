import {
  Fragment,
  type CSSProperties,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ApplicationDefinition,
  InteractionDefinition,
  JsonValue,
} from "@oui/core";
import type { OUIOperationRuntime } from "@oui/data";
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
  buildRoutePath,
  compileCollectionPattern,
  compileDetailPattern,
  materializeQueryInput,
  resourceValue,
  type CollectionPatternModel,
  type DetailPatternModel,
  type ResourceFieldModel,
  type RelationshipRegionModel,
} from "./compiler";
import { classifyResourceLoadState } from "./state";

export interface CollectionPatternProps {
  readonly application: ApplicationDefinition;
  readonly interaction: InteractionDefinition;
  readonly operationRuntime: OUIOperationRuntime;
  readonly parameters: Readonly<Record<string, string | number>>;
  readonly search: Readonly<Record<string, JsonValue>>;
  readonly available?: boolean;
  readonly variant?: "list" | "table";
  readonly virtualize?: boolean;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref?: (href: string) => string;
  readonly onSearchChange: (
    updates: Readonly<Record<string, JsonValue | undefined>>,
  ) => void;
}

export interface DetailPatternProps {
  readonly application: ApplicationDefinition;
  readonly interaction: InteractionDefinition;
  readonly operationRuntime: OUIOperationRuntime;
  readonly parameters: Readonly<Record<string, string | number>>;
  readonly search: Readonly<Record<string, JsonValue>>;
  readonly available?: boolean;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref?: (href: string) => string;
}

interface QuerySnapshot {
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: unknown;
  readonly loading: boolean;
  readonly stale: boolean;
}

export function CollectionPattern({
  application,
  interaction,
  operationRuntime,
  parameters,
  search,
  available = true,
  variant,
  virtualize = false,
  onNavigate,
  resolveHref = identityHref,
  onSearchChange,
}: CollectionPatternProps): ReactElement {
  const model = useMemo(
    () => compileCollectionPattern(application, interaction),
    [application, interaction],
  );
  const input = useMemo(
    () => materializeQueryInput(model.query, parameters, search),
    [model.query, parameters, search],
  );
  const { snapshot, refresh } = useResourceQuery(
    operationRuntime,
    model.query.id,
    input,
    available,
  );
  const items = readRecords(
    readPath(snapshot.output, model.query.output.itemsPath ?? "items"),
  );
  const partial = snapshot.output?.partial === true;
  const state = classifyResourceLoadState({
    available,
    loading: snapshot.loading,
    error: snapshot.error,
    itemCount: items.length,
    stale: snapshot.stale,
    partial,
  });
  const nextPage = readPath(
    snapshot.output,
    model.pagination.responseTokenPath,
  );

  return (
    <Stack gap="section">
      <h1>{label(interaction)}</h1>
      <CollectionFilters
        model={model}
        onSearchChange={onSearchChange}
        search={search}
      />
      <ResourceState state={state} onRetry={refresh}>
        {state === "empty" ? (
          <section aria-label="Empty collection">
            <h2>{model.emptyTitle}</h2>
            <p>{model.emptyDescription}</p>
          </section>
        ) : (
          <CollectionItems
            items={items}
            model={model}
            onNavigate={onNavigate}
            resolveHref={resolveHref}
            variant={variant ?? model.preferredVariant}
            virtualize={virtualize}
          />
        )}
      </ResourceState>
      <Inline>
        <Button
          disabled={!hasPageToken(search.page)}
          onAction={() => {
            onSearchChange({ page: undefined });
          }}
        >
          Previous page
        </Button>
        <Button
          disabled={!hasPageToken(nextPage)}
          onAction={() => {
            onSearchChange({ page: toJsonValue(nextPage) });
          }}
        >
          Next page
        </Button>
      </Inline>
    </Stack>
  );
}

export function DetailPattern({
  application,
  interaction,
  operationRuntime,
  parameters,
  search,
  available = true,
  onNavigate,
  resolveHref = identityHref,
}: DetailPatternProps): ReactElement {
  const model = useMemo(
    () => compileDetailPattern(application, interaction),
    [application, interaction],
  );
  const input = useMemo(
    () => materializeQueryInput(model.query, parameters, search),
    [model.query, parameters, search],
  );
  const { snapshot, refresh } = useResourceQuery(
    operationRuntime,
    model.query.id,
    input,
    available,
  );
  const item = readRecord(
    readPath(snapshot.output, model.query.output.itemPath ?? "item"),
  );
  const partial = snapshot.output?.partial === true;
  const state = classifyResourceLoadState({
    available,
    loading: snapshot.loading,
    error: snapshot.error,
    itemCount: item === undefined ? 0 : 1,
    stale: snapshot.stale,
    partial,
  });

  return (
    <Stack gap="section">
      <ResourceState state={state} onRetry={refresh}>
        {item === undefined ? (
          <section aria-label="Empty resource">
            <h1>Resource not found</h1>
            <p>The requested resource is not available.</p>
          </section>
        ) : (
          <DetailContent
            item={item}
            model={model}
            onNavigate={onNavigate}
            resolveHref={resolveHref}
            response={snapshot.output}
          />
        )}
      </ResourceState>
    </Stack>
  );
}

function CollectionFilters({
  model,
  search,
  onSearchChange,
}: {
  readonly model: CollectionPatternModel;
  readonly search: Readonly<Record<string, JsonValue>>;
  readonly onSearchChange: (
    updates: Readonly<Record<string, JsonValue | undefined>>,
  ) => void;
}): ReactElement {
  const textFilter = model.filters.find(({ kind }) => kind === "text");
  const optionFilter = model.filters.find(
    ({ kind }) => kind === "multi_select",
  );
  const [query, setQuery] = useState(
    textFilter === undefined ? "" : String(search[textFilter.searchName] ?? ""),
  );
  const selectedStatuses = new Set(
    optionFilter === undefined
      ? []
      : readStrings(search[optionFilter.searchName]),
  );
  const sortOptions = model.sorting.fields.map((field) => ({
    id: field.name,
    label: field.label,
  }));
  const selectedSort =
    typeof search.sort === "string" ? search.sort : model.sorting.defaultField;
  const selectedDirection =
    search.direction === "descending"
      ? "descending"
      : model.sorting.defaultDirection;

  useEffect(() => {
    setQuery(
      textFilter === undefined
        ? ""
        : String(search[textFilter.searchName] ?? ""),
    );
  }, [search, textFilter]);

  return (
    <section aria-label="Collection controls">
      <Stack>
        {textFilter === undefined ? null : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSearchChange({
                [textFilter.searchName]: query,
                page: undefined,
              });
            }}
          >
            <Inline>
              <Field label="Search" onChange={setQuery} value={query} />
              <Button type="submit">Apply filters</Button>
            </Inline>
          </form>
        )}
        {optionFilter === undefined ? null : (
          <fieldset>
            <legend>{optionFilter.field?.label ?? "Filter"}</legend>
            <Inline>
              {optionFilter.options.map((option) => (
                <Checkbox
                  key={option.id}
                  label={option.label}
                  onChange={(selected) => {
                    const next = new Set(selectedStatuses);
                    if (selected) {
                      next.add(option.id);
                    } else {
                      next.delete(option.id);
                    }
                    onSearchChange({
                      [optionFilter.searchName]: [...next],
                      page: undefined,
                    });
                  }}
                  selected={selectedStatuses.has(option.id)}
                />
              ))}
            </Inline>
          </fieldset>
        )}
        <Inline>
          <Selection
            label="Sort by"
            onSelectionChange={(field) => {
              onSearchChange({ sort: field, page: undefined });
            }}
            options={sortOptions}
            selectedKey={selectedSort}
          />
          <Button
            ariaLabel={`Sort ${selectedDirection}`}
            onAction={() => {
              onSearchChange({
                direction:
                  selectedDirection === "ascending"
                    ? "descending"
                    : "ascending",
                page: undefined,
              });
            }}
          >
            {selectedDirection === "ascending" ? "Ascending" : "Descending"}
          </Button>
        </Inline>
      </Stack>
    </section>
  );
}

function CollectionItems({
  items,
  model,
  onNavigate,
  resolveHref,
  variant,
  virtualize,
}: {
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly model: CollectionPatternModel;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref: (href: string) => string;
  readonly variant: "list" | "table";
  readonly virtualize: boolean;
}): ReactElement {
  const [selected, setSelected] = useState<string>();
  const select = (identity: string, next: boolean) => {
    setSelected(next ? identity : undefined);
  };

  if (virtualize) {
    return (
      <VirtualCollection
        items={items}
        model={model}
        onNavigate={onNavigate}
        resolveHref={resolveHref}
        onSelect={select}
        selected={selected}
      />
    );
  }
  return variant === "table" ? (
    <CollectionTable
      items={items}
      model={model}
      onNavigate={onNavigate}
      resolveHref={resolveHref}
      onSelect={select}
      selected={selected}
    />
  ) : (
    <CollectionList
      items={items}
      model={model}
      onNavigate={onNavigate}
      resolveHref={resolveHref}
      onSelect={select}
      selected={selected}
    />
  );
}

function CollectionTable(props: CollectionRendererProps): ReactElement {
  const { items, model } = props;
  return (
    <table aria-label={`${label(model.interaction)} collection`}>
      <thead>
        <tr>
          {model.selection.maximum === 0 ? null : <th scope="col">Select</th>}
          {model.fields.map((field) => (
            <th key={field.id} scope="col">
              {field.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={itemIdentity(item, model)}>
            {model.selection.maximum === 0 ? null : (
              <td>
                <ItemSelection item={item} {...props} />
              </td>
            )}
            {model.fields.map((field, index) => (
              <td key={field.id}>
                {index === 0 ? (
                  <ItemLink
                    item={item}
                    model={model}
                    onNavigate={props.onNavigate}
                    resolveHref={props.resolveHref}
                  >
                    {formatValue(resourceValue(item, field))}
                  </ItemLink>
                ) : (
                  formatValue(resourceValue(item, field))
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CollectionList(props: CollectionRendererProps): ReactElement {
  return (
    <ul aria-label={`${label(props.model.interaction)} collection`}>
      {props.items.map((item) => (
        <li key={itemIdentity(item, props.model)}>
          <CollectionListItem item={item} {...props} />
        </li>
      ))}
    </ul>
  );
}

function VirtualCollection(props: CollectionRendererProps): ReactElement {
  const viewport = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: props.items.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  return (
    <div
      aria-label={`${label(props.model.interaction)} collection`}
      ref={viewport}
      role="list"
      style={{ maxHeight: "30rem", overflow: "auto" }}
    >
      <div
        style={{
          height: `${String(virtualizer.getTotalSize())}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = props.items[virtualItem.index];
          if (item === undefined) {
            return null;
          }
          const style: CSSProperties = {
            left: 0,
            position: "absolute",
            top: 0,
            transform: `translateY(${String(virtualItem.start)}px)`,
            width: "100%",
          };
          return (
            <div
              data-index={virtualItem.index}
              key={itemIdentity(item, props.model)}
              ref={virtualizer.measureElement}
              role="listitem"
              style={style}
            >
              <CollectionListItem item={item} {...props} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CollectionRendererProps {
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly model: CollectionPatternModel;
  readonly selected: string | undefined;
  readonly onSelect: (identity: string, selected: boolean) => void;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref: (href: string) => string;
}

function CollectionListItem({
  item,
  model,
  selected,
  onSelect,
  onNavigate,
  resolveHref,
}: CollectionRendererProps & {
  readonly item: Readonly<Record<string, unknown>>;
}): ReactElement {
  const identity = itemIdentity(item, model);
  return (
    <article>
      <Inline>
        {model.selection.maximum === 0 ? null : (
          <ItemSelection
            item={item}
            items={[item]}
            model={model}
            onNavigate={onNavigate}
            onSelect={onSelect}
            resolveHref={resolveHref}
            selected={selected}
          />
        )}
        <ItemLink
          item={item}
          model={model}
          onNavigate={onNavigate}
          resolveHref={resolveHref}
        >
          {formatValue(
            resourceValue(item, model.fields[0] ?? model.identityField),
          )}
        </ItemLink>
      </Inline>
      <dl>
        {model.fields.slice(1).map((field) => (
          <FieldValue field={field} item={item} key={field.id} />
        ))}
      </dl>
      <span hidden>{identity}</span>
    </article>
  );
}

function ItemSelection({
  item,
  model,
  selected,
  onSelect,
}: CollectionRendererProps & {
  readonly item: Readonly<Record<string, unknown>>;
}): ReactElement {
  const identity = itemIdentity(item, model);
  const title = formatValue(
    resourceValue(item, model.fields[0] ?? model.identityField),
  );
  return (
    <Checkbox
      label={`Select ${title}`}
      onChange={(next) => {
        onSelect(identity, next);
      }}
      selected={selected === identity}
    />
  );
}

function ItemLink({
  children,
  item,
  model,
  onNavigate,
  resolveHref,
}: {
  readonly children: string;
  readonly item: Readonly<Record<string, unknown>>;
  readonly model: CollectionPatternModel;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref: (href: string) => string;
}): ReactElement {
  if (model.itemRoute === undefined) {
    return <span>{children}</span>;
  }
  const href = buildRoutePath(
    model.itemRoute,
    resourceValue(item, model.identityField),
  );
  return (
    <a
      href={resolveHref(href)}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(href);
      }}
    >
      {children}
    </a>
  );
}

/**
 * The records on the far side of a to-many relationship.
 *
 * Rendered as a list rather than a value, because that is what the cardinality
 * declares. An empty list says so rather than rendering nothing, so a reader
 * can tell "none" from "not loaded".
 */
function RelatedRecords({
  items,
  label,
  onNavigate,
  resolveHref,
  response,
}: {
  readonly items: NonNullable<RelationshipRegionModel["items"]>;
  readonly label: string;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref: (href: string) => string;
  readonly response: Readonly<Record<string, unknown>> | undefined;
}): ReactElement {
  const records = readRecords(readPath(response, items.path));
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {records.length === 0 ? (
          <span>None</span>
        ) : (
          <ul>
            {records.map((record, index) => {
              const text = formatValue(resourceValue(record, items.labelField));
              const identity =
                items.identityField === undefined
                  ? undefined
                  : resourceValue(record, items.identityField);
              const key = `${items.path}:${String(identity ?? index)}`;
              if (items.route === undefined || identity === undefined) {
                return <li key={key}>{text}</li>;
              }
              const href = buildRoutePath(items.route, identity);
              return (
                <li key={key}>
                  <a
                    href={resolveHref(href)}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(href);
                    }}
                  >
                    {text}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </dd>
    </>
  );
}

function DetailContent({
  item,
  model,
  onNavigate,
  resolveHref,
  response,
}: {
  readonly item: Readonly<Record<string, unknown>>;
  readonly model: DetailPatternModel;
  readonly onNavigate: (href: string) => void;
  readonly resolveHref: (href: string) => string;
  /**
   * The whole detail response. A to-many relationship reads its records from
   * a sibling of the subject rather than from the subject itself.
   */
  readonly response: Readonly<Record<string, unknown>> | undefined;
}): ReactElement {
  const identity = resourceValue(item, model.identityField);
  return (
    <>
      <header>
        <h1>{formatValue(resourceValue(item, model.titleField))}</h1>
        <p>
          {model.identityField.label}: {formatValue(identity)}
        </p>
        {model.editRoute === undefined ? null : (
          <a
            href={resolveHref(buildRoutePath(model.editRoute, identity))}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(buildRoutePath(model.editRoute!, identity));
            }}
          >
            Edit
          </a>
        )}
      </header>
      {model.regions.map((region) => {
        if (region.kind === "relationships") {
          return (
            <section aria-label="Relationships" key={region.id}>
              <h2>Relationships</h2>
              <dl>
                {region.relationships.map((relationship) => {
                  // A to-many relationship renders its related records. It
                  // names no field of the parent, because no single field of a
                  // parent can stand for a collection of children — reading
                  // one anyway is what made an asset display its own name
                  // under the label of its obligations.
                  if (relationship.items !== undefined) {
                    return (
                      <RelatedRecords
                        items={relationship.items}
                        key={relationship.id}
                        label={relationship.label}
                        onNavigate={onNavigate}
                        resolveHref={resolveHref}
                        response={response}
                      />
                    );
                  }
                  if (relationship.field === undefined) {
                    return null;
                  }
                  const label = {
                    ...relationship.field,
                    label: relationship.label,
                  };
                  if (relationship.route === undefined) {
                    return (
                      <FieldValue
                        field={label}
                        item={item}
                        key={relationship.id}
                      />
                    );
                  }
                  // A declared route makes the relationship followable.
                  const href = buildRoutePath(
                    relationship.route,
                    resourceValue(
                      item,
                      relationship.identityField ?? relationship.field,
                    ),
                  );
                  return (
                    <Fragment key={relationship.id}>
                      <dt>{relationship.label}</dt>
                      <dd>
                        <a
                          href={resolveHref(href)}
                          onClick={(event) => {
                            event.preventDefault();
                            onNavigate(href);
                          }}
                        >
                          {formatValue(resourceValue(item, relationship.field))}
                        </a>
                      </dd>
                    </Fragment>
                  );
                })}
              </dl>
            </section>
          );
        }
        if (region.kind === "history" && region.sourceField !== undefined) {
          return (
            <History
              key={region.id}
              value={resourceValue(item, region.sourceField)}
            />
          );
        }
        return (
          <section aria-label="Attributes" key={region.id}>
            <h2>Attributes</h2>
            <dl>
              {region.fields.map((field) => (
                <FieldValue field={field} item={item} key={field.id} />
              ))}
            </dl>
          </section>
        );
      })}
    </>
  );
}

function History({ value }: { readonly value: unknown }): ReactElement {
  const entries = Array.isArray(value) ? value : [];
  return (
    <section aria-label="History">
      <h2>History</h2>
      {entries.length === 0 ? (
        <p>No history is available.</p>
      ) : (
        <ol>
          {entries.map((entry, index) => (
            <li key={String(index)}>{formatValue(entry)}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FieldValue({
  field,
  item,
}: {
  readonly field: ResourceFieldModel;
  readonly item: Readonly<Record<string, unknown>>;
}): ReactElement {
  return (
    <>
      <dt>{field.label}</dt>
      <dd>{formatValue(resourceValue(item, field))}</dd>
    </>
  );
}

function ResourceState({
  state,
  onRetry,
  children,
}: {
  readonly state: ReturnType<typeof classifyResourceLoadState>;
  readonly onRetry: () => void;
  readonly children: ReactElement | null;
}): ReactElement {
  if (state === "unavailable") {
    return (
      <Feedback kind="warning">
        This resource is unavailable for the current account.
      </Feedback>
    );
  }
  if (state === "loading") {
    return (
      <Status busy label="Resource loading status">
        Loading resources
      </Status>
    );
  }
  if (state === "error") {
    return (
      <Feedback kind="error">
        Resources could not be loaded. <Button onAction={onRetry}>Retry</Button>
      </Feedback>
    );
  }
  return (
    <>
      {state === "stale" ? (
        <Status busy label="Resource refresh status">
          Refreshing stale data
        </Status>
      ) : null}
      {state === "partial" ? (
        <Feedback kind="warning">Some resource data is unavailable.</Feedback>
      ) : null}
      {children}
    </>
  );
}

function useResourceQuery(
  runtime: OUIOperationRuntime,
  queryId: string,
  input: Readonly<Record<string, unknown>>,
  available: boolean,
): {
  readonly snapshot: QuerySnapshot;
  readonly refresh: () => void;
} {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<QuerySnapshot>({
    loading: available,
    stale: false,
  });

  useEffect(() => {
    if (!available) {
      setSnapshot({ loading: false, stale: false });
      return undefined;
    }
    let active = true;
    setSnapshot((current) => ({
      ...current,
      error: undefined,
      loading: true,
      stale: current.output !== undefined,
    }));
    void runtime
      .query<Readonly<Record<string, unknown>>>(queryId, input)
      .then((output) => {
        if (active) {
          setSnapshot({
            output,
            loading: false,
            stale: false,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSnapshot({
            error,
            loading: false,
            stale: false,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [available, input, queryId, refreshVersion, runtime]);

  return {
    snapshot,
    refresh: () => {
      setRefreshVersion((current) => current + 1);
    },
  };
}

function readPath(
  value: Readonly<Record<string, unknown>> | undefined,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return typeof current === "object" &&
      current !== null &&
      !Array.isArray(current)
      ? (current as Readonly<Record<string, unknown>>)[segment]
      : undefined;
  }, value);
}

function readRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readRecords(
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Readonly<Record<string, unknown>> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function readStrings(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" && value !== ""
      ? [value]
      : [];
}

function itemIdentity(
  item: Readonly<Record<string, unknown>>,
  model: CollectionPatternModel,
): string {
  return String(resourceValue(item, model.identityField));
}

function label(interaction: InteractionDefinition): string {
  return interaction.label.fallback ?? interaction.label.id ?? interaction.id;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "Not provided";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function hasPageToken(value: unknown): boolean {
  return typeof value === "string" && value !== "";
}

function toJsonValue(value: unknown): JsonValue | undefined {
  return typeof value === "string" ? value : undefined;
}

function identityHref(href: string): string {
  return href;
}
