export interface ReferenceRuntimeConfig {
  readonly ontoBffUrl: string;
  readonly testToken?: string;
}

export function parseReferenceRuntimeConfig(
  input: Readonly<Record<string, unknown>>,
): ReferenceRuntimeConfig {
  if (typeof input.ontoBffUrl !== "string" || input.ontoBffUrl.trim() === "") {
    throw new Error(
      "VITE_ONTOBFF_URL is required for the live integration entrypoint.",
    );
  }
  let endpoint: URL;
  try {
    endpoint = new URL(input.ontoBffUrl);
  } catch {
    throw new Error("VITE_ONTOBFF_URL must be an absolute URL.");
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("VITE_ONTOBFF_URL must use HTTP or HTTPS.");
  }
  if (endpoint.username !== "" || endpoint.password !== "") {
    throw new Error("VITE_ONTOBFF_URL must not contain credentials.");
  }
  const ontoBffUrl = endpoint.toString().replace(/\/$/u, "");
  const testToken =
    typeof input.testToken === "string" && input.testToken !== ""
      ? input.testToken
      : undefined;
  return Object.freeze({
    ontoBffUrl,
    ...(testToken === undefined ? {} : { testToken }),
  });
}

export async function loadReferenceRuntimeConfig(
  fetchRuntime: typeof fetch = fetch,
): Promise<ReferenceRuntimeConfig> {
  const response = await fetchRuntime(
    `${import.meta.env.BASE_URL}oui-runtime-config.json`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Reference runtime configuration is unavailable (${String(response.status)}).`,
    );
  }
  return parseReferenceRuntimeConfig(
    (await response.json()) as Readonly<Record<string, unknown>>,
  );
}
