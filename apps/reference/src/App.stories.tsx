import type { Meta, StoryObj } from "@storybook/react-vite";
import { App } from "./App";
import { referenceTestComposition } from "./application.testing";

const meta = {
  title: "Workspace/Reference application",
  component: App,
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: { composition: referenceTestComposition },
};
