import type { ModelConfig } from "../shared/generation";
export function serverSettings(env: (name: string) => string | undefined) {
  const origin = env("APP_ORIGIN") ?? "",
    salt = env("RATE_LIMIT_SALT") ?? "";
  if (!origin || !salt || new URL(origin).origin !== origin)
    throw new Error("Configure APP_ORIGIN and RATE_LIMIT_SALT in Convex.");
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
    salt,
    ipLimit: integer("IP_GENERATIONS_PER_HOUR", 10, 1),
    dailyCap: integer("GLOBAL_DAILY_GENERATION_CAP", 100),
    model,
  };
}
