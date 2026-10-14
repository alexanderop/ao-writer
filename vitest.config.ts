import { defineConfig } from "vitest/config";

/**
Separate from vite.config.ts on purpose: that one loads the TanStack Start plugin.
`.ts` import extensions and the `#/` alias (package.json "imports") resolve natively in Vite.
*/
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
