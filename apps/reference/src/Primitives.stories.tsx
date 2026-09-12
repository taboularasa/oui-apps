import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrimitiveShowcase } from "./PrimitiveShowcase";

const meta = {
  title: "Primitives/Accessible states",
  component: PrimitiveShowcase,
  parameters: {
    a11y: {
      test: "error",
    },
  },
} satisfies Meta<typeof PrimitiveShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { state: "default" },
};

export const Disabled: Story = {
  args: { state: "disabled" },
};

export const Invalid: Story = {
  args: { state: "invalid" },
};

export const Busy: Story = {
  args: { state: "busy" },
};

export const Unavailable: Story = {
  args: { state: "unavailable" },
};
