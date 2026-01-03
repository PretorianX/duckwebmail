import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setupTests.ts"],
    css: true,
    pool: "threads",
    // Vitest v4: `poolOptions` was removed. Keep deterministic runs by disabling file parallelism.
    // This forces `maxWorkers` to 1 (see Vitest config typing/docs).
    fileParallelism: false
  }
});
