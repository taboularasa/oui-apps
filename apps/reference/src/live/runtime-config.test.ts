import { describe, expect, it, vi } from "vitest";
import {
  loadReferenceRuntimeConfig,
  parseReferenceRuntimeConfig,
} from "./runtime-config";

describe("reference live runtime configuration", () => {
  it("accepts a public endpoint and a runtime-injected test credential", () => {
    const injectedCredential = crypto.randomUUID();

    expect(
      parseReferenceRuntimeConfig({
        ontoBffUrl: "http://127.0.0.1:18083/",
        testToken: injectedCredential,
      }),
    ).toEqual({
      ontoBffUrl: "http://127.0.0.1:18083",
      testToken: injectedCredential,
    });
  });

  it.each([
    [{}, "VITE_ONTOBFF_URL is required"],
    [
      { ontoBffUrl: "http://actor:credential@127.0.0.1:18083" },
      "must not contain credentials",
    ],
    [{ ontoBffUrl: "file:///tmp/bff" }, "must use HTTP or HTTPS"],
  ])("fails closed for unsafe runtime configuration %#", (input, message) => {
    expect(() => parseReferenceRuntimeConfig(input)).toThrow(message);
  });

  it("loads credentials only from the no-store runtime document", async () => {
    const injectedCredential = crypto.randomUUID();
    const fetchRuntime = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ontoBffUrl: "http://127.0.0.1:18083",
            testToken: injectedCredential,
          }),
        ),
    );

    await expect(loadReferenceRuntimeConfig(fetchRuntime)).resolves.toEqual({
      ontoBffUrl: "http://127.0.0.1:18083",
      testToken: injectedCredential,
    });
    expect(fetchRuntime).toHaveBeenCalledWith(
      "/oui-runtime-config.json",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
