// `import.meta.glob` is a Vite/Vitest build-time transform the convex test files
// use to load the function-module map for convex-test. Its type ships in
// `vite/client`, which pnpm does not expose at the project root, so declare just
// the surface used here. (.d.ts — ignored by the Convex bundler and by fallow.)
interface ImportMeta {
  glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
}
