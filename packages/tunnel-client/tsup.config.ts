import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@axeos-vpn/shared-types', '@axeos-vpn/shared-utils', 'ws'],
});
