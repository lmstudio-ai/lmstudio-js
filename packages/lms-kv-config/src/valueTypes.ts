import {
  allowableEnvVarsSchema,
  gpuSplitConfigSchema,
  kvConfigFieldDependencySchema,
  llmContextOverflowPolicySchema,
  llmContextReferenceSchema,
  llmLlamaAccelerationOffloadRatioSchema,
  llmLlamaCacheQuantizationTypeSchema,
  llmLlamaLogitBiasConfigSchema,
  llmLlamaMirostatSamplingConfigSchema,
  llmMlxKvCacheQuantizationSchema,
  llmPromptTemplateSchema,
  llmReasoningParsingSchema,
  llmStructuredPredictionSettingSchema,
  llmToolChoiceSchema,
  llmToolUseSettingSchema,
  modelDomainTypeSchema,
  retrievalChunkingMethodSchema,
  toolNamingSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import {
  deepEquals,
  KVFieldValueTypesLibraryBuilder,
  type InferKVValueTypeDef,
  type KVFieldValueTypeLibrary,
} from "./KVConfig.js";

/**
 * Quote a string.
 */
function quoteString(str: string | undefined, empty?: string) {
  if (str === undefined || str === "") {
    return empty ?? '""';
  }
  return JSON.stringify(str);
}

/**
 * Quote a string that may include manual escape. (i.e. newlines represented with "\\n")
 */
function quoteStringWithManualEscape(str: string | undefined, empty?: string) {
  return quoteString(str?.replace(/\\n/g, "\n"), empty);
}

/**
 * Builder for all the basic KV types.
 *
 * @public
 */
const baseKVValueTypesLibraryBuilder = new KVFieldValueTypesLibraryBuilder({
  /**
   * Display name of the field.
   */
  displayName: z.string().optional(),
  /**
   * Hint about the field. Shown when hovering over the field.
   */
  hint: z.string().optional(),
  /**
   * A field can be marked as model centric when it loses its meaning when there is no model to
   * reference.
   *
   * An example would be prompt template. There is no point to configure prompt template when there
   * isn't a specific model.
   *
   * @experimental This field is experimental and may change in the future.
   */
  modelCentric: z.boolean().optional(),
  /**
   * A field can be marked as non-configurable when it is only used as a means to carry information.
   * As a result, it will not be shown in the UI.
   *
   * An example would be context length for MLX, as you cannot change it.
   *
   * @experimental This field is experimental and may change in the future.
   */
  nonConfigurable: z.boolean().optional(),
  /**
   * A field can be marked as engineDoesNotSupport when when the engine running the model does not
   * support the field.
   *
   * @experimental This field is experimental and may change in the future.
   */
  engineDoesNotSupport: z.boolean().optional(),
  /**
   * A field can be marked as machine dependent when its value is highly dependent on the machine
   * that is being used. When exporting the config, one may decide to not include machine dependent
   * fields by default.
   *
   * An example would be GPU offload settings.
   *
   * @experimental This field is experimental and may change in the future.
   */
  machineDependent: z.boolean().optional(),
  warning: z.string().optional(),
  subtitle: z.string().optional(),
  isExperimental: z.boolean().optional(),
  dependencies: z.array(kvConfigFieldDependencySchema).optional(),
})
  .valueType("numeric", {
    paramType: {
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      int: z.boolean().optional(),
      precision: z.number().int().nonnegative().optional(),
      slider: z
        .object({
          min: z.number(),
          max: z.number(),
          step: z.number(),
        })
        .optional(),
      shortHand: z.string().optional(),
    },
    schemaMaker: ({ min, max, int, precision }) => {
      let schema = z.number();
      if (min !== undefined) {
        schema = schema.min(min);
      }
      if (max !== undefined) {
        schema = schema.max(max);
      }
      if (int) {
        if (precision !== undefined) {
          throw new Error("Cannot specify both int and precision.");
        }
        schema = schema.int();
      }
      return schema;
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: (value, { int, precision }) => {
      if (int) {
        return String(Math.round(value));
      }
      return value.toFixed(precision ?? 2);
    },
  })
  .valueType("string", {
    paramType: {
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      isParagraph: z.boolean().optional(),
      isProtected: z.boolean().optional(),
      /**
       * If true, the string should match to a single token.
       */
      isToken: z.boolean().optional(),
      placeholder: z.string().optional(),
    },
    schemaMaker: ({ minLength, maxLength }) => {
      let schema = z.string();
      if (minLength !== undefined) {
        schema = schema.min(minLength);
      }
      if (maxLength !== undefined) {
        schema = schema.max(maxLength);
      }
      return schema;
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: (value, { isParagraph, isProtected }, { t, desiredLength }) => {
      if (isProtected) {
        return "********";
      }

      if (isParagraph) {
        if (value === "") {
          return t("config:customInputs.string.emptyParagraph", "<Empty>");
        } else {
          if (desiredLength === undefined || value.length <= desiredLength) {
            return value;
          } else {
            return (
              value.slice(0, Math.floor(desiredLength / 2)) +
              " ... " +
              value.slice(-Math.ceil(desiredLength / 2))
            );
          }
        }
      } else {
        const quoted = quoteString(value);
        if (desiredLength === undefined || quoted.length <= desiredLength) {
          return quoted;
        } else {
          return (
            quoted.slice(0, Math.floor(desiredLength / 2)) +
            "..." +
            quoted.slice(-Math.ceil(desiredLength / 2))
          );
        }
      }
    },
  })
  .valueType("select", {
    paramType: {
      options: z
        .array(z.object({ value: z.string().nonempty(), displayName: z.string() }).or(z.string()))
        .refine(
          options => {
            // See if there are any duplicate values.
            const values = new Set<string>();
            for (const option of options) {
              const value = typeof option === "string" ? option : option.value;
              if (values.has(value)) {
                return false;
              }
              values.add(value);
            }
            return true;
          },
          {
            message: "Duplicate values in options.",
          },
        ),
    },
    schemaMaker: ({ options }) => {
      const allowedValues = new Set(
        options.map(option => (typeof option === "string" ? option : option.value)),
      );
      return z.string().refine(value => allowedValues.has(value));
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: value => {
      return value;
    },
  })
  .valueType("boolean", {
    paramType: {},
    schemaMaker: () => {
      return z.boolean();
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: value => {
      return value ? "ON" : "OFF";
    },
  })
  .valueType("stringArray", {
    paramType: {
      maxNumItems: z.number().optional(),
      /**
       * Whether to allow empty strings in the array. Default is false.
       */
      allowEmptyStrings: z.boolean().optional(),
    },
    schemaMaker: ({ maxNumItems, allowEmptyStrings }) => {
      let stringSchema = z.string();
      if (!allowEmptyStrings) {
        stringSchema = stringSchema.min(1);
      }
      let schema = z.array(stringSchema);
      if (maxNumItems !== undefined) {
        schema = schema.max(maxNumItems);
      }
      return schema;
    },
    effectiveEquals: (a, b) => {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    },
    stringify: (value, _typeParam, { t, desiredLength }) => {
      const quoted = value.map(v => quoteString(v));
      if (quoted.length === 0) {
        return t("config:customInputs.stringArray.empty", "<Empty>");
      }
      if (quoted.length <= 2 || desiredLength === undefined) {
        return quoted.join(", ");
      }
      // Desired length does not need to be followed strictly. It is just a hint.
      let currentLength = quoted[0].length + quoted[1].length + 6;
      for (let i = 1; i < quoted.length - 1; i++) {
        currentLength += quoted[i].length + 2;
        if (currentLength >= desiredLength) {
          return quoted.slice(0, i).join(", ") + ", ..." + quoted[quoted.length - 1];
        }
      }
      return quoted.join(", ");
    },
  })
  .valueType("directory", {
    paramType: {
      accessPermission: z.enum(["read", "readWrite", "none"]).optional(),
    },
    schemaMaker: () => {
      return z.string();
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: value => {
      return value;
    },
  })
  .valueType("directoryGroup", {
    paramType: {
      accessPermission: z.enum(["read", "readWrite", "none"]).optional(),
    },
    schemaMaker: () => {
      return z.array(z.string());
    },
    effectiveEquals: (a, b) => {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    },
    stringify: value => {
      if (value.length === 0) {
        return "<Empty>";
      }
      return value.join(", ");
    },
  });

/**
 * Basic key-value field value types library. These are the types that are exposed to plugins.
 *
 * @public
 */
export const basicKVValueTypesLibrary = baseKVValueTypesLibraryBuilder.build();

/**
 * The global key-value field value types library. This includes all the basic types and additional
 * types that are used in the LM Studio application.
 *
 * @public
 */
export const kvValueTypesLibrary = baseKVValueTypesLibraryBuilder
  .valueType("checkboxNumeric", {
    paramType: {
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      int: z.boolean().optional(),
      uncheckedHint: z.string().optional(),
      precision: z.number().int().nonnegative().optional(),
      slider: z
        .object({
          min: z.number(),
          max: z.number(),
          step: z.number(),
        })
        .optional(),
    },
    schemaMaker: ({ min, max, int, precision }) => {
      let numberSchema = z.number();
      if (min !== undefined) {
        numberSchema = numberSchema.min(min);
      }
      if (max !== undefined) {
        numberSchema = numberSchema.max(max);
      }
      if (int) {
        if (precision !== undefined) {
          throw new Error("Cannot specify both int and precision.");
        }
        numberSchema = numberSchema.int();
      }
      return z.object({
        checked: z.boolean(),
        value: numberSchema,
      });
    },
    effectiveEquals: (a, b) => {
      if (a.checked !== b.checked) {
        return false;
      }
      if (!a.checked) {
        return true;
      }
      return a.value === b.value;
    },
    stringify: (value, { int, precision }, { t }) => {
      if (!value.checked) {
        return t("config:customInputs.checkboxNumeric.off", "OFF");
      }
      if (int) {
        return String(Math.round(value.value));
      }
      return value.value.toFixed(precision ?? 2);
    },
  })
  .valueType("numericArray", {
    paramType: {
      min: z.number().optional(),
      max: z.number().optional(),
      int: z.boolean().optional(),
    },
    schemaMaker: ({ min, max, int }) => {
      let numberSchema = z.number();
      if (min !== undefined) {
        numberSchema = numberSchema.min(min);
      }
      if (max !== undefined) {
        numberSchema = numberSchema.max(max);
      }
      if (int) {
        numberSchema = numberSchema.int();
      }
      return z.array(numberSchema);
    },
    effectiveEquals: (a, b) => {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    },
    stringify: (value, { int }) => {
      return value.map(v => (int ? String(Math.round(v)) : String(v))).join(", ");
    },
  })
  .valueType("contextOverflowPolicy", {
    paramType: {},
    schemaMaker: () => {
      return llmContextOverflowPolicySchema;
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: (value, _typeParam, { t }) => {
      switch (value) {
        case "stopAtLimit":
          return t("config:customInputs.contextOverflowPolicy.stopAtLimit", "Stop At Limit");
        case "truncateMiddle":
          return t("config:customInputs.contextOverflowPolicy.truncateMiddle", "Truncate Middle");
        case "rollingWindow":
          return t("config:customInputs.contextOverflowPolicy.rollingWindow", "Rolling Window");
      }
    },
  })
  .valueType("context", {
    paramType: {},
    schemaMaker: () => {
      return z.array(llmContextReferenceSchema);
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b);
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("contextLength", {
    paramType: {
      max: z.number().optional(),
    },
    schemaMaker: () => {
      return z.number().int().positive();
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: (value, { max }) => {
      if (max === undefined) {
        return String(value);
      }
      return `${value}/${max}`;
    },
  })
  .valueType("modelIdentifier", {
    paramType: {
      domain: z.array(modelDomainTypeSchema).optional(),
    },
    schemaMaker: () => {
      return z.string();
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: value => {
      return value;
    },
  })
  .valueType("llmPromptTemplate", {
    paramType: {},
    schemaMaker: () => {
      return llmPromptTemplateSchema;
    },
    effectiveEquals: (a, b) => {
      if (a.type !== b.type) {
        return false;
      }
      if (a.stopStrings.length !== b.stopStrings.length) {
        return false;
      }
      if (!a.stopStrings.every((v, i) => v === b.stopStrings[i])) {
        return false;
      }
      switch (a.type) {
        case "jinja":
          return a.jinjaPromptTemplate?.template === b.jinjaPromptTemplate?.template;
        case "manual":
          return (
            a.manualPromptTemplate?.beforeSystem === b.manualPromptTemplate?.beforeSystem &&
            a.manualPromptTemplate?.afterSystem === b.manualPromptTemplate?.afterSystem &&
            a.manualPromptTemplate?.beforeUser === b.manualPromptTemplate?.beforeUser &&
            a.manualPromptTemplate?.afterUser === b.manualPromptTemplate?.afterUser &&
            a.manualPromptTemplate?.beforeAssistant === b.manualPromptTemplate?.beforeAssistant &&
            a.manualPromptTemplate?.afterAssistant === b.manualPromptTemplate?.afterAssistant
          );
        default: {
          const exhaustiveCheck: never = a.type;
          throw new Error("Unknown template type: " + exhaustiveCheck);
        }
      }
    },
    stringify: (value, _typeParam, { t, desiredLength }) => {
      switch (value.type) {
        case "jinja": {
          const lead =
            `${t("config:customInputs.llmPromptTemplate.type", "Type")}: ` +
            `${t("config:customInputs.llmPromptTemplate.types.jinja/label", "Jinja")}\n` +
            `${t("config:customInputs.llmPromptTemplate.jinja.template/label", "Template")}: `;
          if (desiredLength === undefined) {
            return lead + value.jinjaPromptTemplate?.template;
          }
          const currentLength = lead.length;
          const remainingLength = Math.min(100, desiredLength - currentLength);
          const template = value.jinjaPromptTemplate?.template ?? "";
          if (template.length <= remainingLength) {
            return lead + template;
          }
          return (
            lead +
            template.slice(0, Math.floor(remainingLength / 2)) +
            "..." +
            template.slice(-Math.ceil(remainingLength / 2))
          );
        }
        case "manual": {
          return (
            `${t("config:customInputs.llmPromptTemplate.type", "Type")}: ` +
            `${t("config:customInputs.llmPromptTemplate.types.manual/label", "Manual")}\n` +
            `${t("config:customInputs.llmPromptTemplate.manual.subfield.beforeSystem/label", "Before System")}: ` +
            `${quoteStringWithManualEscape(value.manualPromptTemplate?.beforeSystem)}\n` +
            `${t("config:customInputs.llmPromptTemplate.manual.subfield.afterSystem/label", "After System")}: ` +
            `${quoteStringWithManualEscape(value.manualPromptTemplate?.afterSystem)}\n` +
            `${t("config:customInputs.llmPromptTemplate.manual.subfield.beforeUser/label", "Before User")}: ` +
            `${quoteStringWithManualEscape(value.manualPromptTemplate?.beforeUser)}\n` +
            `${t("config:customInputs.llmPromptTemplate.manual.subfield.afterUser/label", "After User")}: ` +
            `${quoteStringWithManualEscape(value.manualPromptTemplate?.afterUser)}\n` +
            `${t("config:customInputs.llmPromptTemplate.manual.subfield.beforeAssistant/label", "Before Assistant")}: ` +
            `${quoteStringWithManualEscape(value.manualPromptTemplate?.beforeAssistant)}\n` +
            `${t("config:customInputs.llmPromptTemplate.manual.subfield.afterAssistant/label", "After Assistant")}: ` +
            `${quoteStringWithManualEscape(value.manualPromptTemplate?.afterAssistant)}`
          );
        }
        default: {
          const exhaustiveCheck: never = value.type;
          throw new Error("Unknown template type: " + exhaustiveCheck);
        }
      }
    },
  })
  .valueType("llmReasoningParsing", {
    paramType: {},
    schemaMaker: () => {
      return llmReasoningParsingSchema;
    },
    effectiveEquals: (a, b) => {
      return a.startString === b.startString && a.endString === b.endString;
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("llamaStructuredOutput", {
    paramType: {},
    schemaMaker: () => {
      return llmStructuredPredictionSettingSchema;
    },
    effectiveEquals: (a, b) => {
      if (a.type === "json" && b.type === "json") {
        return deepEquals(a, b);
      } else if (a.type === "none" && b.type === "none") {
        return true;
      } else {
        return false;
      }
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("speculativeDecodingDraftModel", {
    paramType: {},
    schemaMaker: () => {
      // Empty string means no speculative decoding.
      return z.string();
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: (value, _typeParam, { t }) => {
      if (value === "") {
        return t("config:customInputs.speculativeDecodingDraftModel.off", "OFF");
      }
      return value;
    },
  })
  .valueType("toolUse", {
    paramType: {},
    schemaMaker: () => {
      return llmToolUseSettingSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b); // TODO: more performant comparison
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("toolChoice", {
    paramType: {},
    schemaMaker: () => {
      return llmToolChoiceSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b);
    },
    stringify: value => {
      return JSON.stringify(value, null, 2);
    },
  })
  .valueType("toolNaming", {
    paramType: {},
    schemaMaker: () => {
      return toolNamingSchema;
    },
    effectiveEquals: (a, b) => {
      return a === b;
    },
    stringify: value => {
      return value;
    },
  })
  .valueType("llamaAccelerationOffloadRatio", {
    paramType: {
      numLayers: z.number().optional(),
    },
    schemaMaker: () => {
      return llmLlamaAccelerationOffloadRatioSchema;
    },
    effectiveEquals: (a, b) => {
      const ratioA = a === "max" ? 1 : a === "off" ? 0 : a;
      const ratioB = b === "max" ? 1 : b === "off" ? 0 : b;
      return ratioA === ratioB;
    },
    stringify: (value, { numLayers }, { t }) => {
      if (value === "max" || value === 1) {
        const label = t("config:customInputs.llamaAccelerationOffloadRatio.max", "MAX");
        if (numLayers !== 0) {
          return `${label} (${numLayers})`;
        }
        return label;
      }
      if (value === "off" || value === 0) {
        return t("config:customInputs.llamaAccelerationOffloadRatio.off", "OFF");
      }
      if (numLayers !== undefined) {
        return String(Math.round(numLayers * value));
      }
      return (value * 100).toFixed(0) + "%";
    },
  })
  .valueType("llamaMirostatSampling", {
    paramType: {},
    schemaMaker: () => {
      return llmLlamaMirostatSamplingConfigSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b); // TODO: more performant comparison
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("llamaLogitBias", {
    paramType: {},
    schemaMaker: () => {
      return llmLlamaLogitBiasConfigSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b); // TODO: more performant comparison
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("llamaCacheQuantizationType", {
    paramType: {},
    schemaMaker: () => {
      return z.object({
        checked: z.boolean(),
        value: llmLlamaCacheQuantizationTypeSchema,
      });
    },
    effectiveEquals: (a, b) => {
      if (a.checked !== b.checked) {
        return false;
      }
      if (!a.checked) {
        return true;
      }
      return a.value === b.value;
    },
    stringify: (value, _typeParam, { t }) => {
      if (!value.checked) {
        return t("config:customInputs.llamaCacheQuantizationType.off", "OFF");
      }
      return value.value;
    },
  })
  .valueType("mlxKvCacheQuantizationType", {
    paramType: {},
    schemaMaker: () => {
      return llmMlxKvCacheQuantizationSchema;
    },
    effectiveEquals: (a, b) => {
      if (a.enabled !== b.enabled) {
        return false;
      }
      if (!a.enabled) {
        return true;
      }
      return (
        a.bits === b.bits && a.groupSize === b.groupSize && a.quantizedStart === b.quantizedStart
      );
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("retrievalChunkingMethod", {
    paramType: {},
    schemaMaker: () => {
      return retrievalChunkingMethodSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b); // TODO: more performant comparison
    },
    stringify: value => {
      return JSON.stringify(value, null, 2); // TODO: pretty print
    },
  })
  .valueType("envVars", {
    paramType: {},
    schemaMaker: () => {
      return allowableEnvVarsSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b);
    },
    stringify: value => {
      return JSON.stringify(value, null, 2);
    },
  })
  .valueType("gpuSplitConfig", {
    paramType: {},
    schemaMaker: () => {
      return gpuSplitConfigSchema;
    },
    effectiveEquals: (a, b) => {
      return deepEquals(a, b);
    },
    stringify: value => {
      return JSON.stringify(value, null, 2);
    },
  })
  .build();

export type KVValueTypeDef = InferKVValueTypeDef<typeof kvValueTypesLibrary>;
/**
 * @public
 */
export type GlobalKVValueTypesLibrary = typeof kvValueTypesLibrary;
export type BasicKVValueTypesLibrary = typeof basicKVValueTypesLibrary;
/**
 * @public
 */
export type GlobalKVFieldValueTypeLibraryMap =
  GlobalKVValueTypesLibrary extends KVFieldValueTypeLibrary<infer TKVFieldValueTypeLibraryMap>
    ? TKVFieldValueTypeLibraryMap
    : never;
/**
 * @public
 */
export type BasicKVFieldValueTypeLibraryMap =
  BasicKVValueTypesLibrary extends KVFieldValueTypeLibrary<infer TKVFieldValueTypeLibraryMap>
    ? TKVFieldValueTypeLibraryMap
    : never;
