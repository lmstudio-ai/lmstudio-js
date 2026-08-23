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
  // Keep CommonJS plugin sources that use require() working in the ESM bundle.
  '--banner:js=import { createRequire } from "module"; const require = createRequire(import.meta.url);',
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
