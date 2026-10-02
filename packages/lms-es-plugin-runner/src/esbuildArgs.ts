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
  // Don't bundle node_modules as they are not necessarily designed to be bundled.
  "--packages=external",
  // Say the format out loud rather than inheriting esbuild's platform default.
  // The output is written as .js next to the plugin's own package.json, so what
  // Node makes of it depends on that file's "type" field - see the commonjs
  // marker written alongside the entry file in generateEntryFile.ts.
  "--format=cjs",
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
