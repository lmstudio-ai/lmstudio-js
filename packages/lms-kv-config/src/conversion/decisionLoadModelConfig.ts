import {
  decisionLoadModelConfigSchema,
  type DecisionLoadModelConfig,
  type KVConfig,
} from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import { decisionLlamaLoadConfigSchematics } from "../schema.js";
import {
  kvConfigToLLMLoadModelConfig,
  llmLoadModelConfigToKVConfig,
} from "./llmLoadModelConfig.js";

/** Adapter for established GGUF helpers only; decision settings stay in their own persisted scope. */
export function decisionLoadConfigToLlamaConfig(config: KVConfig): KVConfig {
  config = collapseKVStackRaw([decisionLlamaLoadConfigSchematics.buildFullConfig({}), config]);
  return {
    fields: config.fields
      .filter(field => !field.key.startsWith("llm."))
      .map(field => ({ ...field, key: field.key.replace(/^decision\.load\./, "llm.load.") })),
  };
}
interface KvConfigToDecisionLoadModelConfigOpts {
  useDefaultsForMissingKeys?: boolean;
}
export function kvConfigToDecisionLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys = false }: KvConfigToDecisionLoadModelConfigOpts = {},
): DecisionLoadModelConfig {
  const effective = useDefaultsForMissingKeys
    ? collapseKVStackRaw([decisionLlamaLoadConfigSchematics.buildFullConfig({}), config])
    : config;
  const mapped: KVConfig = {
    fields: effective.fields
      .filter(field => !field.key.startsWith("llm."))
      .map(field => ({ ...field, key: field.key.replace(/^decision\.load\./, "llm.load.") })),
  };
  return decisionLoadModelConfigSchema.innerType().parse({
    ...kvConfigToLLMLoadModelConfig(mapped),
    autoFitMinContextLength: decisionLlamaLoadConfigSchematics
      .parsePartial(effective)
      .get("autoFitMinContextLength"),
  });
}
export function decisionLoadModelConfigToKVConfig(config: DecisionLoadModelConfig): KVConfig {
  const { autoFitMinContextLength, ...common } = decisionLoadModelConfigSchema.parse(config);
  const mapped = llmLoadModelConfigToKVConfig(common);
  const own: KVConfig = {
    // The LLM converter also normalizes AutoFit for MLX/Splash/vLLM. Retain only the
    // declared decision/GGUF surface, using its schema rather than another field allowlist.
    fields: mapped.fields
      .map(field => ({ ...field, key: field.key.replace(/^llm\.load\./, "decision.load.") }))
      .filter(field => decisionLlamaLoadConfigSchematics.hasFullKey(field.key)),
  };
  return collapseKVStackRaw([
    own,
    decisionLlamaLoadConfigSchematics.buildPartialConfig({ autoFitMinContextLength }),
  ]);
}
