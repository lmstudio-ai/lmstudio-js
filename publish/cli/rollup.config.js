const { nodeResolve } = require("@rollup/plugin-node-resolve");
const { join, resolve } = require("path");
const commonjs = require("@rollup/plugin-commonjs");
const json = require("@rollup/plugin-json");
const banner = require("rollup-plugin-banner2");

module.exports = {
  input: resolve(require.resolve("@lmstudio/lms-cli")),
  output: [
    {
      file: join(__dirname, "dist", "index.js"),
      format: "cjs",
      inlineDynamicImports: true,
    },
  ],
  context: "globalThis",
  plugins: [
    nodeResolve({
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    }),
    commonjs(),
    json(),
    banner(() => "#!/usr/bin/env node\n"),
  ],
};
