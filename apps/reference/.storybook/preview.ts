import type { Preview } from "@storybook/react-vite";
import "@oui/theme-default/styles.css";
import "@oui/react-aria/styles.css";
import "../src/styles.css";

const preview = {
  parameters: {
    layout: "centered",
  },
} satisfies Preview;

export default preview;
