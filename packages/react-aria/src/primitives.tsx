import type { ReactElement, ReactNode } from "react";
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  Dialog as AriaDialog,
  DialogTrigger,
  FieldError,
  Input,
  Label,
  Link as AriaLink,
  ListBox,
  ListBoxItem,
  Modal,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue,
  Text,
  TextField,
} from "react-aria-components";

export interface ButtonProps {
  readonly children: ReactNode;
  readonly onAction?: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly unavailable?: boolean;
  readonly type?: "button" | "reset" | "submit";
  readonly ariaLabel?: string;
}

export function Button({
  children,
  onAction,
  disabled = false,
  busy = false,
  unavailable = false,
  type = "button",
  ariaLabel,
}: ButtonProps): ReactElement {
  return (
    <AriaButton
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      {...(onAction === undefined ? {} : { onPress: onAction })}
      aria-busy={busy || undefined}
      className="oui-button"
      data-busy={busy || undefined}
      data-unavailable={unavailable || undefined}
      isDisabled={disabled || busy || unavailable}
      type={type}
    >
      {children}
    </AriaButton>
  );
}

export interface LinkProps {
  readonly children: ReactNode;
  readonly href: string;
  readonly disabled?: boolean;
  readonly unavailable?: boolean;
  readonly current?: boolean;
  readonly ariaLabel?: string;
}

export function Link({
  children,
  href,
  disabled = false,
  unavailable = false,
  current = false,
  ariaLabel,
}: LinkProps): ReactElement {
  return (
    <AriaLink
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      aria-current={current ? "page" : undefined}
      className="oui-link"
      data-unavailable={unavailable || undefined}
      href={href}
      isDisabled={disabled || unavailable}
    >
      {children}
    </AriaLink>
  );
}

export interface FieldProps {
  readonly label: string;
  readonly name?: string;
  readonly description?: string;
  readonly errorMessage?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly inputType?: "date" | "datetime-local" | "number" | "text";
}

export function Field({
  label,
  name,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  disabled = false,
  invalid = false,
  required = false,
  readOnly = false,
  inputType = "text",
}: FieldProps): ReactElement {
  return (
    <TextField
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(name === undefined ? {} : { name })}
      {...(onChange === undefined ? {} : { onChange })}
      {...(value === undefined ? {} : { value })}
      className="oui-field"
      isDisabled={disabled}
      isInvalid={invalid}
      isReadOnly={readOnly}
      isRequired={required}
    >
      <Label>{label}</Label>
      {description === undefined ? null : (
        <Text slot="description">{description}</Text>
      )}
      <Input type={inputType} />
      {errorMessage === undefined ? null : (
        <FieldError>{errorMessage}</FieldError>
      )}
    </TextField>
  );
}

export interface CheckboxProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onChange?: (selected: boolean) => void;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
}

export function Checkbox({
  label,
  selected,
  onChange,
  disabled = false,
  readOnly = false,
}: CheckboxProps): ReactElement {
  return (
    <AriaCheckbox
      {...(onChange === undefined ? {} : { onChange })}
      className="oui-checkbox"
      isDisabled={disabled}
      isReadOnly={readOnly}
      isSelected={selected}
    >
      <span aria-hidden="true" className="oui-checkbox-indicator">
        {selected ? "✓" : ""}
      </span>
      {label}
    </AriaCheckbox>
  );
}

export interface SelectionOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectionProps {
  readonly label: string;
  readonly options: readonly SelectionOption[];
  readonly selectedKey?: string;
  readonly defaultSelectedKey?: string;
  readonly onSelectionChange?: (key: string) => void;
  readonly description?: string;
  readonly errorMessage?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
}

export function Selection({
  label,
  options,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  description,
  errorMessage,
  disabled = false,
  invalid = false,
}: SelectionProps): ReactElement {
  return (
    <AriaSelect
      {...(defaultSelectedKey === undefined ? {} : { defaultSelectedKey })}
      {...(selectedKey === undefined ? {} : { selectedKey })}
      className="oui-selection"
      isDisabled={disabled}
      isInvalid={invalid}
      onSelectionChange={(key) => {
        if (key !== null) {
          onSelectionChange?.(String(key));
        }
      }}
    >
      <Label>{label}</Label>
      {description === undefined ? null : (
        <Text slot="description">{description}</Text>
      )}
      <AriaButton className="oui-selection-trigger">
        <SelectValue />
        <span aria-hidden="true">▾</span>
      </AriaButton>
      {errorMessage === undefined ? null : (
        <FieldError>{errorMessage}</FieldError>
      )}
      <AriaPopover className="oui-popover">
        <ListBox className="oui-listbox">
          {options.map((option) => (
            <ListBoxItem
              {...(option.disabled === undefined
                ? {}
                : { isDisabled: option.disabled })}
              className="oui-listbox-item"
              id={option.id}
              key={option.id}
              textValue={option.label}
            >
              {option.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </AriaPopover>
    </AriaSelect>
  );
}

export interface DialogProps {
  readonly triggerLabel: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly dismissLabel?: string;
}

export function Dialog({
  triggerLabel,
  title,
  children,
  dismissLabel = "Close",
}: DialogProps): ReactElement {
  return (
    <DialogTrigger>
      <AriaButton className="oui-button">{triggerLabel}</AriaButton>
      <Modal className="oui-modal" isDismissable>
        <AriaDialog aria-label={title} className="oui-dialog">
          {({ close }) => (
            <>
              <h2>{title}</h2>
              <div>{children}</div>
              <AriaButton className="oui-button" onPress={close}>
                {dismissLabel}
              </AriaButton>
            </>
          )}
        </AriaDialog>
      </Modal>
    </DialogTrigger>
  );
}

export interface PopoverProps {
  readonly triggerLabel: string;
  readonly ariaLabel: string;
  readonly children: ReactNode;
}

export function Popover({
  triggerLabel,
  ariaLabel,
  children,
}: PopoverProps): ReactElement {
  return (
    <DialogTrigger>
      <AriaButton className="oui-button">{triggerLabel}</AriaButton>
      <AriaPopover className="oui-popover">
        <AriaDialog aria-label={ariaLabel} className="oui-popover-content">
          {children}
        </AriaDialog>
      </AriaPopover>
    </DialogTrigger>
  );
}

export interface FeedbackProps {
  readonly children: ReactNode;
  readonly kind?: "error" | "info" | "success" | "warning";
}

export function Feedback({
  children,
  kind = "info",
}: FeedbackProps): ReactElement {
  return (
    <div
      aria-live={kind === "error" ? "assertive" : "polite"}
      className="oui-feedback"
      data-kind={kind}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export interface StatusProps {
  readonly children: ReactNode;
  readonly busy?: boolean;
  readonly label?: string;
}

export function Status({
  children,
  busy = false,
  label,
}: StatusProps): ReactElement {
  return (
    <output
      {...(label === undefined ? {} : { "aria-label": label })}
      aria-busy={busy || undefined}
      aria-live="polite"
      className="oui-status"
      role="status"
    >
      {children}
    </output>
  );
}

export interface StackProps {
  readonly children: ReactNode;
  readonly gap?: "block" | "inline" | "section";
}

export function Stack({ children, gap = "block" }: StackProps): ReactElement {
  return (
    <div className="oui-stack" data-gap={gap}>
      {children}
    </div>
  );
}

export interface InlineProps {
  readonly children: ReactNode;
  readonly gap?: "block" | "inline" | "section";
}

export function Inline({
  children,
  gap = "inline",
}: InlineProps): ReactElement {
  return (
    <div className="oui-inline" data-gap={gap}>
      {children}
    </div>
  );
}
