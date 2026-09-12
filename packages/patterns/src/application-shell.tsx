import type { ReactElement, ReactNode } from "react";

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly current?: boolean;
  readonly unavailable?: boolean;
  readonly onNavigate?: () => void;
  readonly children?: readonly NavigationItem[];
}

export interface ApplicationShellProps {
  readonly productName: string;
  readonly homeHref?: string;
  readonly navigation: readonly NavigationItem[];
  readonly children: ReactNode;
  readonly globalFeedback?: ReactNode;
  readonly actor?: ReactNode;
}

export function ApplicationShell({
  productName,
  homeHref = "/",
  navigation,
  children,
  globalFeedback,
  actor,
}: ApplicationShellProps): ReactElement {
  return (
    <div data-oui-application-shell="">
      <a data-oui-skip-link="" href="#oui-main-content">
        Skip to main content
      </a>
      <header data-oui-shell-header="">
        <a aria-label={`${productName} home`} href={homeHref}>
          {productName}
        </a>
        {actor === undefined ? null : (
          <div aria-label="Current account">{actor}</div>
        )}
      </header>
      <nav aria-label="Primary" data-oui-shell-navigation="">
        <NavigationList items={navigation} />
      </nav>
      <main data-oui-shell-content="" id="oui-main-content" tabIndex={-1}>
        {children}
      </main>
      <aside
        aria-label="Global feedback"
        aria-live="polite"
        data-oui-shell-feedback=""
      >
        {globalFeedback}
      </aside>
    </div>
  );
}

function NavigationList({
  items,
}: {
  readonly items: readonly NavigationItem[];
}): ReactElement {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          {item.href === undefined || item.unavailable === true ? (
            <span aria-disabled={item.unavailable} data-unavailable="">
              {item.label}
            </span>
          ) : (
            <a
              aria-current={item.current === true ? "page" : undefined}
              href={item.href}
              onClick={(event) => {
                if (item.onNavigate !== undefined) {
                  event.preventDefault();
                  item.onNavigate();
                }
              }}
            >
              {item.label}
            </a>
          )}
          {item.children === undefined || item.children.length === 0 ? null : (
            <NavigationList items={item.children} />
          )}
        </li>
      ))}
    </ul>
  );
}
