import { expect, it } from "vitest";
// @ts-expect-error deployment scripts are executable JavaScript.
import { assertDeploymentEnv } from "../scripts/deployment-env.mjs";
it.each([
  "http://127.0.0.1:55321/functions/v1/api",
  "https://127.0.0.1/api",
  "https://localhost/api",
  "https://localhost./api",
  "https://[::ffff:127.0.0.1]/api",
  "https://192.168.1.2/api",
  "https://test.localhost/api",
  "https://[::1]/api",
  "https://0.0.0.0/api",
  "https://YOUR_PROJECT.supabase.co/functions/v1/api",
])("blocks deploying %s", (url) => {
  expect(() => assertDeploymentEnv({ VITE_API_URL: url })).toThrow();
});
it("validates the actual override rather than only the hosted project URL", () => {
  expect(() =>
    assertDeploymentEnv({
      VITE_API_URL: "http://127.0.0.1:55321/functions/v1/api",
      VITE_SUPABASE_URL: "https://example.supabase.co",
    }),
  ).toThrow();
  expect(
    assertDeploymentEnv({ VITE_SUPABASE_URL: "https://example.supabase.co" }),
  ).toBe("https://example.supabase.co/functions/v1/api");
  expect(() => assertDeploymentEnv({})).toThrow();
});
