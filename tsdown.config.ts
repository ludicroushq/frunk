import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    cli: './src/cli.ts',
    index: './src/index.ts',
  },
  format: 'esm',
  clean: true,
  dts: true,
  target: 'node18',
  platform: 'node',
  shims: true,
  external: ['ansis', 'execa', 'micromatch'],
  esbuildOptions: {
    packages: 'external',
  },
});