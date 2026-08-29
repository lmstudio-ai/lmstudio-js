interface EsBuildArgsOpts {
  entryPath: string;
  outPath: string;
  watch?: boolean;
  production?: boolean;
}
const alwaysArgs = [
  "--platform=node",
  "--target=node18.16.0",
  "--sourcemap=inline",
  "--tree-shaking=true",
  "--bundle",
  "--format=esm",
  // Keep CommonJS plugin sources that use Node's module and file globals working in the ESM bundle.
  '--banner:js=import { createRequire as __lmsCreateRequire } from "module"; import { fileURLToPath as __lmsFileURLToPath } from "url"; import { dirname as __lmsDirname } from "path"; if (!("require" in globalThis)) Object.defineProperty(globalThis, "require", { value: __lmsCreateRequire(import.meta.url), configurable: true }); if (!("__filename" in globalThis)) Object.defineProperty(globalThis, "__filename", { value: __lmsFileURLToPath(import.meta.url), configurable: true }); if (!("__dirname" in globalThis)) Object.defineProperty(globalThis, "__dirname", { value: __lmsDirname(globalThis.__filename), configurable: true });',
  // Don't bundle node_modules as they are not necessarily designed to be bundled.
  "--packages=external",
];
export function createEsBuildArgs({ entryPath, outPath, watch, production }: EsBuildArgsOpts) {
  // We don't need to worry about shell injections here because we never pass the args to a shell,
  // but rather to spawn directly.
  const args = [entryPath, ...alwaysArgs];
  args.push("--outfile=" + outPath);
  if (watch) {
    args.push("--watch");
  }
  if (production) {
    args.push('--define:process.env.NODE_ENV="production"');
  } else {
    args.push('--define:process.env.NODE_ENV="development"');
  }
  return args;
}
