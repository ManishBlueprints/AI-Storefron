import type { ModelConfig } from "../shared/generation";
export function allowedFrontendOrigins(
  env: (name: string) => string | undefined,
) {
  const values = [
    env("APP_ORIGIN") ?? "",
    ...(env("APP_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ];
  if (
    values.some((value) => {
      try {
        const url = new URL(value);
        return (
          !["http:", "https:"].includes(url.protocol) || url.origin !== value
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      "Configure exact frontend origins without paths or trailing slashes.",
    );
  return [...new Set(values)];
}
export function serverSettings(env: (name: string) => string | undefined) {
  const origin = env("APP_ORIGIN") ?? "",
    salt = env("RATE_LIMIT_SALT") ?? "";
  if (!origin || !salt || new URL(origin).origin !== origin)
    throw new Error("Configure APP_ORIGIN and RATE_LIMIT_SALT in Convex.");
  const allowedOrigins = allowedFrontendOrigins(env);
  const integer = (name: string, fallback: number, min = 0) => {
    const n = Number(env(name) || fallback);
    if (!Number.isSafeInteger(n) || n < min) throw new Error(`Invalid ${name}`);
    return n;
  };
  const models = (env("KILO_MODELS") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (models.some((m) => !m.endsWith(":free")))
    throw new Error("Only configured free models are allowed.");
  const model: ModelConfig = {
    provider: "kilo",
    key: env("KILO_API_KEY") ?? "",
    models,
    jsonModels: (env("KILO_JSON_MODELS") ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    maxTokens: integer("KILO_MAX_TOKENS", 3000, 1),
    disableReasoning: env("KILO_DISABLE_REASONING") !== "false",
    origin,
  };
  return {
    origin,
    allowedOrigins,
    salt,
    ipLimit: integer("IP_GENERATIONS_PER_HOUR", 10, 1),
    dailyCap: integer("GLOBAL_DAILY_GENERATION_CAP", 100),
    model,
  };
}
