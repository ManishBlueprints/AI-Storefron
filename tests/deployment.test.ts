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
  "https://YOUR_PROJECT.convex.site/api",
  "https://YOUR_DEPLOYMENT.convex.site/api",
])("blocks deploying %s", (url) => {
  expect(() => assertDeploymentEnv({ VITE_API_URL: url })).toThrow();
});
it("validates the actual override rather than only the hosted project URL", () => {
  expect(() =>
    assertDeploymentEnv({
      VITE_API_URL: "http://127.0.0.1:55321/functions/v1/api",
      VITE_CONVEX_URL: "https://example.convex.cloud",
    }),
  ).toThrow();
  expect(
    assertDeploymentEnv({ VITE_CONVEX_URL: "https://example.convex.cloud" }),
  ).toBe("https://example.convex.site/api");
  expect(() => assertDeploymentEnv({})).toThrow();
});

it("derives Convex HTTP actions from the cloud deployment URL", () => {
  expect(
    assertDeploymentEnv({
      VITE_CONVEX_URL: "https://bold-bandicoot-351.convex.cloud/",
    }),
  ).toBe("https://bold-bandicoot-351.convex.site/api");
  expect(() =>
    assertDeploymentEnv({
      VITE_CONVEX_URL: "https://YOUR_DEPLOYMENT.convex.cloud",
    }),
  ).toThrow();
});
