import {
  Button,
  Dialog,
  Feedback,
  Field,
  Inline,
  Link,
  Popover,
  Selection,
  Stack,
  Status,
} from "@oui/react-aria";

export type PrimitiveShowcaseState =
  "busy" | "default" | "disabled" | "invalid" | "unavailable";

export interface PrimitiveShowcaseProps {
  readonly state?: PrimitiveShowcaseState;
  readonly onAction?: () => void;
}

const options = [
  { id: "north", label: "North region" },
  { id: "south", label: "South region" },
] as const;

export function PrimitiveShowcase({
  state = "default",
  onAction,
}: PrimitiveShowcaseProps) {
  if (state === "disabled") {
    return (
      <Stack>
        <Button {...(onAction === undefined ? {} : { onAction })} disabled>
          Disabled action
        </Button>
        <Field disabled label="Disabled field" />
        <Selection disabled label="Disabled selection" options={options} />
      </Stack>
    );
  }

  if (state === "invalid") {
    return (
      <Field
        description="Enter a dispatch code."
        errorMessage="A dispatch code is required."
        invalid
        label="Dispatch code"
        required
      />
    );
  }

  if (state === "busy") {
    return (
      <Inline>
        <Button {...(onAction === undefined ? {} : { onAction })} busy>
          Saving
        </Button>
        <Status busy label="Save status">
          Saving changes
        </Status>
      </Inline>
    );
  }

  if (state === "unavailable") {
    return (
      <Inline>
        <Button {...(onAction === undefined ? {} : { onAction })} unavailable>
          Schedule unavailable
        </Button>
        <Link href="/reports" unavailable>
          Reports unavailable
        </Link>
      </Inline>
    );
  }

  return (
    <Stack>
      <Inline>
        <Button {...(onAction === undefined ? {} : { onAction })}>
          Create appointment
        </Button>
        <Link href="#primitive-details">View details</Link>
      </Inline>
      <Field
        description="Used on customer communications."
        label="Display name"
      />
      <Selection
        defaultSelectedKey="north"
        description="Determines the dispatch queue."
        label="Service region"
        options={options}
      />
      <Inline>
        <Dialog title="Appointment details" triggerLabel="Open dialog">
          Confirm the appointment before dispatch.
        </Dialog>
        <Popover ariaLabel="Scheduling guidance" triggerLabel="Open guidance">
          Choose a window the customer confirmed.
        </Popover>
      </Inline>
      <Feedback kind="success">Appointment draft is valid.</Feedback>
      <Status label="Synchronization status">All changes synchronized.</Status>
    </Stack>
  );
}
