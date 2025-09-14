import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    cli: "./src/cli.ts",
    index: "./src/index.ts",
  },
  esbuildOptions: {
    packages: "external",
  },
  external: ["ansis", "execa", "micromatch"],
  format: "esm",
  platform: "node",
  shims: true,
  target: "node18",
});
