import { createClient } from "@supabase/supabase-js";
import { createHandler } from "./handler.ts";
const env = (name: string) => Deno.env.get(name) ?? "";
const origin = env("APP_ORIGIN");
const salt = env("RATE_LIMIT_SALT");
if (!origin || !salt) {
  throw new Error("APP_ORIGIN and RATE_LIMIT_SALT must be configured.");
}
if (new URL(origin).origin !== origin) {
  throw new Error(
    "APP_ORIGIN must be an exact origin without a trailing slash or path.",
  );
}
const integer = (name: string, fallback: number, minimum = 0) => {
  const value = Number(env(name) || fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a nonnegative integer.`);
  }
  return value;
};
const provider = env("AI_PROVIDER") || "kilo";
if (provider !== "kilo" && provider !== "openrouter") {
  throw new Error("AI_PROVIDER must be kilo or openrouter.");
}
const prefix = provider === "kilo" ? "KILO" : "OPENROUTER";
const models = env(`${prefix}_MODELS`)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (
  models.some(
    (model) =>
      !model.endsWith(":free") &&
      !(provider === "openrouter" && model === "openrouter/free"),
  )
) {
  throw new Error("Only confirmed free model IDs are allowed.");
}
console.info(
  JSON.stringify({
    event: "model_configuration",
    provider,
    models,
    has_api_key: Boolean(env(`${prefix}_API_KEY`)),
  }),
);
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  createHandler(db, {
    origin,
    salt,
    ipLimit: integer("IP_GENERATIONS_PER_HOUR", 10, 1),
    dailyCap: integer("GLOBAL_DAILY_GENERATION_CAP", 100),
    model: {
      provider,
      key: env(`${prefix}_API_KEY`),
      models,
      maxTokens: integer(
        `${prefix}_MAX_TOKENS`,
        provider === "kilo" ? 3000 : 2200,
        1,
      ),
      disableReasoning: env(`${prefix}_DISABLE_REASONING`) !== "false",
      jsonModels: env(`${prefix}_JSON_MODELS`)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      origin,
    },
  }),
);
