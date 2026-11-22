import { loadEnv } from "vite";
import { assertDeploymentEnv } from "./deployment-env.mjs";
try {
  assertDeploymentEnv(loadEnv("production", process.cwd(), "VITE_"));
  console.log("Hosted API configuration verified.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
