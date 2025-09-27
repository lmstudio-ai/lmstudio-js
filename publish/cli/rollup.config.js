import { nodeResolve } from "@rollup/plugin-node-resolve";
import { join, dirname } from "path";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import banner from "rollup-plugin-banner2";

const __dirname = dirname(__filename);

export default {
  input: new URL("../../packages/lms-cli/dist/index.js", import.meta.url).pathname,
  output: {
    file: join(__dirname, "dist", "index.js"),
    format: "es",
    inlineDynamicImports: true,
  },
  plugins: [
    replace({
      "import devtools$1 from 'react-devtools-core';":
        "const devtools$1 = { connectToDevTools: () => {} };",
      "devtools$1.connectToDevTools();": "try { devtools$1.connectToDevTools(); } catch(e) {}",
      "delimiters": ["", ""],
      "preventAssignment": true,
    }),
    nodeResolve({
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      preferBuiltins: true,
      exportConditions: ["node"],
    }),
    commonjs({
      transformMixedEsModules: true,
    }),
    json(),
    banner(() => "#!/usr/bin/env node\n"),
  ],
};
