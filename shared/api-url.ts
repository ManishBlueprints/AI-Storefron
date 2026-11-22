export function apiBaseUrl(env: {
  VITE_API_URL?: string;
  VITE_CONVEX_URL?: string;
}) {
  if (env.VITE_API_URL) return env.VITE_API_URL.replace(/\/$/, "");
  if (!env.VITE_CONVEX_URL) return "";
  try {
    const url = new URL(env.VITE_CONVEX_URL);
    if (
      !url.hostname.endsWith(".convex.cloud") &&
      !url.hostname.endsWith(".convex.site")
    )
      return "";
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return "";
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    return url.origin + "/api";
  } catch {
    return "";
  }
}
