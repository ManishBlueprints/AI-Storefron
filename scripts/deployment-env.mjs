import { apiBaseUrl } from "../shared/api-url.ts";
export function assertDeploymentEnv(env) {
  const base = apiBaseUrl(env);
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error(
      "Configure a hosted VITE_CONVEX_URL or VITE_API_URL before deployment.",
    );
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "::" ||
    host.startsWith("::ffff:") ||
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /your_(?:project|deployment)/i.test(base) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Deployment requires a hosted HTTPS API URL. Local development URLs cannot be deployed.",
    );
  }
  return base;
}
