import {
  kvConfigSchema,
  serializeError,
  type KVConfig,
  type KVConfigField,
  type KVConfigLayerName,
  type KVConfigSchematicsDeserializationError,
  type KVConfigStack,
  type SerializedKVConfigSchematics,
} from "@lmstudio/lms-shared-types";
import { type Any } from "ts-toolbelt";
import { z, type ZodSchema } from "zod";

/**
 * Stringify options passed to actual implementations of stringify.
 *
 * @public
 */
export interface InnerFieldStringifyOpts {
  /**
   * Translate function.
   */
  t: (key: string, fallback: string) => string;

  /**
   * If exists, a soft cap on how long the stringified value should be.
   *
   * This does not have to be followed. Mostly used for fields like promptFormatTemplate where it
   * can grow very large.
   */
  desiredLength?: number;
}

/**
 * Stringify options.
 */
interface FieldStringifyOpts {
  /**
   * Translate function. If not provided, inline fallback will be used.
   */
  t?: (key: string) => string;

  /**
   * If exists, a soft cap on how long the stringified value should be.
   *
   * Will not be followed strictly. Mostly used for fields like promptFormatTemplate where it
   * can grow very large.
   */
  desiredLength?: number;
}

// KV Config is the idea of simply storing config as an array of key-value pairs. This file provides
// type definitions and utility classes for working with KV Configs and schemas.
//
// Overview:
//
// - `KVConfig`, the entire config (an array of key-value pairs)
// - `KVField`, a single key-value pair in `KVConfig`
// - `KVFieldValueType`, a type that the value of a KVField can be, can be supplemented with
//   additional parameters to produce more tightly defined types. For example,
//   `llm:llama:prediction:temperature` has the value type of `numeric` with the following
//   parameters: `{ min: 0, max: 1 }`.
// - `KVFieldValueTypesLibrary`, a collection of `KVFieldValueTypes`, built with a builder pattern
//   using `KVFieldValueTypesLibraryBuilder`.
// - `KVConfigSchematics`, a mapping from keys to `KVFieldValueTypes` with associated parameters and
//   default values. Built with a builder pattern using `KVConfigSchematicsBuilder`.
//
// Usage & Implementation:
//
// This file only provides the type definitions and utility classes.
//
// The value types are defined in the `valueTypes.ts` file.
//
// The schema is defined in the `schema.ts` file.

/**
 * Used internally by KVFieldValueTypesLibrary to keep track of a single field value type definition
 * with the generics.
 *
 * @public
 */
export interface KVVirtualFieldValueType {
  value: any;
  param: any;
}
/**
 * Used internally by KVFieldValueTypesLibrary to keep track of all field value type definitions
 * with the generics.
 *
 * @public
 */
export type KVVirtualFieldValueTypesMapping = {
  [key: string]: KVVirtualFieldValueType;
};

/**
 * Represents a single field value type definition.
 *
 * @public
 */
export interface KVConcreteFieldValueType {
  paramType: ZodSchema;
  schemaMaker: (param: any) => ZodSchema;
  effectiveEquals: (a: any, b: any, typeParam: any) => boolean;
  stringify: (value: any, typeParam: any, opts: InnerFieldStringifyOpts) => string;
}
/**
 * @public
 */
export type KVConcreteFieldValueTypesMap = Map<string, KVConcreteFieldValueType>;

type ExposedZodObject<TObject extends {}> = {
  [TKey in keyof TObject]: ZodSchema<TObject[TKey]>;
};

type CanBeUndefinedKeys<TType extends {}> = {
  [TKey in keyof TType]: undefined extends TType[TKey] ? TKey : never;
}[keyof TType];

type AllowOptionalForUndefined<TType extends {}> = Any.Compute<
  {
    [TKey in CanBeUndefinedKeys<TType>]?: TType[TKey];
  } & {
    [TKey in Exclude<keyof TType, CanBeUndefinedKeys<TType>>]: TType[TKey];
  }
>;

/**
 * A builder for building a KVFieldValueTypeLibrary.
 *
 * The reason why a builder is used is to enable much better type inference when defining the value
 * types.
 */
export class KVFieldValueTypesLibraryBuilder<
  TKVFieldValueTypeBase extends {},
  TKVFieldValueTypeLibraryMap extends KVVirtualFieldValueTypesMapping = {},
> {
  private readonly valueTypes: KVConcreteFieldValueTypesMap = new Map();

  public constructor(public readonly baseSchema: ExposedZodObject<TKVFieldValueTypeBase>) {}
  /**
   * Define a new field value type.
   */
  public valueType<TKey extends string, TValueTypeParams extends {}, TValue>(
    key: TKey,
    param: {
      paramType: ExposedZodObject<TValueTypeParams>;
      schemaMaker: (param: TValueTypeParams) => ZodSchema<TValue>;
      effectiveEquals: (a: TValue, b: TValue, typeParam: TValueTypeParams) => boolean;
      stringify: (
        value: TValue,
        typeParam: TValueTypeParams,
        opts: InnerFieldStringifyOpts,
      ) => string;
    },
  ): KVFieldValueTypesLibraryBuilder<
    TKVFieldValueTypeBase,
    TKVFieldValueTypeLibraryMap & {
      [key in TKey]: {
        value: TValue;
        param: AllowOptionalForUndefined<TValueTypeParams & TKVFieldValueTypeBase>;
      };
    }
  > {
    if (this.valueTypes.has(key)) {
      throw new Error(`ValueType with key ${key} already exists`);
    }
    this.valueTypes.set(key, {
      paramType: z.object({
        ...this.baseSchema,
        ...param.paramType,
      }),
      schemaMaker: param.schemaMaker,
      effectiveEquals: param.effectiveEquals,
      stringify: param.stringify,
    });
    return this;
  }
  public build(): KVFieldValueTypeLibrary<TKVFieldValueTypeLibraryMap> {
    return new KVFieldValueTypeLibrary(new Map(this.valueTypes));
  }
}

/**
 * Represents a library of field value types.
 *
 * @public
 */
export class KVFieldValueTypeLibrary<
  TKVFieldValueTypeLibraryMap extends KVVirtualFieldValueTypesMapping,
> {
  public constructor(private readonly valueTypes: KVConcreteFieldValueTypesMap) {}
  /**
   * Gets the schema for a specific field value type with the given key and parameters.
   */
  public getSchema<TKey extends keyof TKVFieldValueTypeLibraryMap & string>(
    key: TKey,
    param: TKVFieldValueTypeLibraryMap[TKey]["param"],
  ): ZodSchema<TKVFieldValueTypeLibraryMap[TKey]["value"]> {
    const valueType = this.valueTypes.get(key);
    if (valueType === undefined) {
      throw new Error(`Cannot find value type ${key}`);
    }
    return valueType.schemaMaker(valueType.paramType.parse(param));
  }

  public parseParamTypes<TKey extends keyof TKVFieldValueTypeLibraryMap & string>(
    key: TKey,
    param: any,
  ): TKVFieldValueTypeLibraryMap[TKey]["param"] {
    return this.valueTypes.get(key)!.paramType.parse(param);
  }

  public effectiveEquals<TKey extends keyof TKVFieldValueTypeLibraryMap & string>(
    key: TKey,
    typeParam: TKVFieldValueTypeLibraryMap[TKey]["param"],
    a: TKVFieldValueTypeLibraryMap[TKey]["value"],
    b: TKVFieldValueTypeLibraryMap[TKey]["value"],
  ) {
    return this.valueTypes.get(key)!.effectiveEquals(a, b, typeParam);
  }

  public stringify<TKey extends keyof TKVFieldValueTypeLibraryMap & string>(
    key: TKey,
    typeParam: TKVFieldValueTypeLibraryMap[TKey]["param"],
    opts: InnerFieldStringifyOpts,
    value: TKVFieldValueTypeLibraryMap[TKey]["value"],
  ) {
    return this.valueTypes.get(key)!.stringify(value, typeParam, opts);
  }
}

export type InferKVValueTypeDef<TLibrary extends KVFieldValueTypeLibrary<any>> =
  TLibrary extends KVFieldValueTypeLibrary<infer RMap extends KVVirtualFieldValueTypesMapping>
    ? {
        [TKey in keyof RMap]: {
          type: TKey;
          value: RMap[TKey]["value"];
          param: RMap[TKey]["param"];
        };
      }[keyof RMap]
    : never;

export type KVVirtualFieldSchema = {
  key: string;
  type: any;
  valueTypeKey: string;
};
export type KVVirtualConfigSchema = {
  [key: string]: KVVirtualFieldSchema;
};

export interface KVConcreteFieldSchema {
  valueTypeKey: string;
  valueTypeParams: any;
  schema: ZodSchema;
  fullKey: string;
  defaultValue?: any;
}

type KeyPatternMatch<TSource, TPattern> = TPattern extends `${infer RParent}.*`
  ? TSource extends `${RParent}.${string}`
    ? TSource
    : never
  : TSource extends TPattern
    ? TSource
    : never;

export class KVConfigSchematicsBuilder<
  TKVFieldValueTypeLibraryMap extends KVVirtualFieldValueTypesMapping,
  TKVConfigSchema extends KVVirtualConfigSchema = {},
> {
  private readonly fields: Map<string, KVConcreteFieldSchema> = new Map();
  /**
   * Prefixes for extensions. Does not affect parsing (i.e. extension fields will still not be
   * visible). However, if a key starts with a prefix that is specified here, it will not be removed
   * when going through the lenient zod schema.
   */
  private readonly extensionPrefixes: Array<string> = [];

  public constructor(
    private readonly valueTypeLibrary: KVFieldValueTypeLibrary<TKVFieldValueTypeLibraryMap>,
  ) {}

  /**
   * Adds a field
   */
  public field<
    TKey extends string,
    TValueTypeKey extends keyof TKVFieldValueTypeLibraryMap & string,
  >(
    key: TKey,
    valueTypeKey: TValueTypeKey,
    valueTypeParams: TKVFieldValueTypeLibraryMap[TValueTypeKey]["param"],
    defaultValue: TKVFieldValueTypeLibraryMap[TValueTypeKey]["value"],
  ): KVConfigSchematicsBuilder<
    TKVFieldValueTypeLibraryMap,
    TKVConfigSchema & {
      [key in TKey]: {
        key: TKey;
        type: TKVFieldValueTypeLibraryMap[TValueTypeKey]["value"];
        valueTypeKey: TValueTypeKey;
      };
    }
  > {
    const schema = this.valueTypeLibrary.getSchema(valueTypeKey, valueTypeParams);
    const defaultValueParseResult = schema.safeParse(defaultValue);
    if (!defaultValueParseResult.success) {
      throw new Error(
        `Invalid default value for field ${key}: ${defaultValueParseResult.error.message}`,
      );
    }
    defaultValue = defaultValueParseResult.data;
    if (this.fields.has(key)) {
      throw new Error(`Cannot add field with key ${key}. Key already exists in the schematics.`);
    }
    this.fields.set(key, {
      valueTypeKey,
      valueTypeParams,
      schema: this.valueTypeLibrary.getSchema(valueTypeKey, valueTypeParams),
      fullKey: key,
      defaultValue,
    });
    return this as any;
  }

  /**
   * Adds an extension point. For example, if called with .extension("hello.world"), then any keys
   * that match "hello.world.*" will be allowed when going through lenient zod schema. However,
   * any extension fields will still not be accessible via this schematics.
   */
  public extension(prefix: string) {
    this.extensionPrefixes.push(`${prefix}.`);
    return this;
  }

  /**
   * Convenience method for grouping a set of fields under a shared namespace.
   *
   * For example, if we want to create two fields: `some:namespace:a` and `some:namespace:b`.
   * Instead of doing:
   *
   * ```ts
   * builder
   *   .field("some:namespace:a", ...)
   *   .field("some:namespace:b", ...)
   * ```
   *
   * We can do:
   *
   * ```ts
   * builder.scope("some:namespace", builder =>
   *  builder
   *   .field("a", ...)
   *   .field("b", ...)
   * )
   * ```
   *
   * This method does support nesting. Whether to nest or not is up to the user.
   */
  public scope<TScopeKey extends string, TInnerConfigSchema extends KVVirtualConfigSchema>(
    scopeKey: TScopeKey,
    fn: (
      builder: KVConfigSchematicsBuilder<TKVFieldValueTypeLibraryMap, {}>,
    ) => KVConfigSchematicsBuilder<TKVFieldValueTypeLibraryMap, TInnerConfigSchema>,
  ): KVConfigSchematicsBuilder<
    TKVFieldValueTypeLibraryMap,
    TKVConfigSchema & {
      [InnerKey in keyof TInnerConfigSchema &
        string as `${TScopeKey}.${InnerKey}`]: TInnerConfigSchema[InnerKey];
    }
  > {
    const innerBuilder = fn(new KVConfigSchematicsBuilder(this.valueTypeLibrary));
    for (const [
      key,
      { valueTypeKey, valueTypeParams, schema, defaultValue },
    ] of innerBuilder.fields.entries()) {
      const fullKey = `${scopeKey}.${key}`;
      if (this.fields.has(fullKey)) {
        throw new Error(
          `Cannot add field with key ${fullKey}. Key already exists in the schematics.`,
        );
      }
      this.fields.set(fullKey, {
        valueTypeKey,
        valueTypeParams,
        schema,
        fullKey,
        defaultValue,
      });
    }
    this.extensionPrefixes.push(
      ...innerBuilder.extensionPrefixes.map(prefix => `${scopeKey}.${prefix}`),
    );
    return this as any;
  }

  public build(): KVConfigSchematics<TKVFieldValueTypeLibraryMap, TKVConfigSchema> {
    return new KVConfigSchematics(this.valueTypeLibrary, this.fields, this.extensionPrefixes);
  }
}

const createParsedKVConfig = Symbol("createParsedKVConfig");

export class KVConfigSchematics<
  TKVFieldValueTypeLibraryMap extends KVVirtualFieldValueTypesMapping,
  TKVConfigSchema extends KVVirtualConfigSchema,
> {
  public constructor(
    private readonly valueTypeLibrary: KVFieldValueTypeLibrary<TKVFieldValueTypeLibraryMap>,
    private readonly fields: Map<string, KVConcreteFieldSchema>,
    private readonly extensionPrefixes: Array<string>,
  ) {}

  public getFieldsMap(): ReadonlyMap<string, KVConcreteFieldSchema> {
    return new Map([...this.fields.values()].map(field => [field.fullKey, field]));
  }

  public obtainField(key: string): KVConcreteFieldSchema {
    const field = this.fields.get(key);
    if (field === undefined) {
      const fieldKeys = [...this.fields.keys()];
      let availableList = fieldKeys
        .slice(0, 10)
        .map(key => `- ${key}`)
        .join("\n");
      if (fieldKeys.length > 10) {
        availableList += `\n... and ${fieldKeys.length - 10} more`;
      }
      throw new Error(
        `Cannot access key ${key}. Key does not exist in the schematics. Available keys:\n\n` +
          availableList,
      );
    }
    return field;
  }

  public obtainFieldByFullKey(fullKey: string): KVConcreteFieldSchema {
    const field = this.getFullKeyMap().get(fullKey);
    if (field === undefined) {
      const fieldKeys = [...this.getFullKeyMap().keys()];
      let availableList = fieldKeys
        .slice(0, 10)
        .map(key => `- ${key}`)
        .join("\n");
      if (fieldKeys.length > 10) {
        availableList += `\n... and ${fieldKeys.length - 10} more`;
      }
      throw new Error(
        `Cannot access full key ${fullKey}. Full key does not exist in the schematics. Available` +
          `keys:\n\n` +
          availableList,
      );
    }
    return field;
  }

  public getSchemaForKey<TKey extends keyof TKVConfigSchema & string>(
    key: TKey,
  ): ZodSchema<TKVConfigSchema[TKey]["type"]> {
    const field = this.obtainField(key);
    return field.schema;
  }

  private parseField(fieldSchema: KVConcreteFieldSchema, value: any) {
    if (value === undefined) {
      if (fieldSchema.defaultValue === undefined) {
        throw new Error(
          `Field with key ${fieldSchema.fullKey} is missing and has no default value`,
        );
      }
      return fieldSchema.defaultValue;
    }
    const parseResult = fieldSchema.schema.safeParse(value);
    if (!parseResult.success) {
      throw new Error(
        `Field with key ${fieldSchema.fullKey} does not satisfy the schema:` +
          parseResult.error.message,
      );
    }
    return parseResult.data;
  }

  private parseFieldWithoutDefault(field: KVConcreteFieldSchema, value: any) {
    if (value === undefined) {
      return undefined;
    }
    const parseResult = field.schema.safeParse(value);
    if (!parseResult.success) {
      throw new Error(
        `Field with key ${field.fullKey} does not satisfy the schema:` + parseResult.error.message,
      );
    }
    return parseResult.data;
  }

  /**
   * Parse and access a field in the config.
   */
  public access<TKey extends keyof TKVConfigSchema & string>(
    config: KVConfig,
    key: TKey,
  ): TKVConfigSchema[TKey]["type"] {
    const field = this.obtainField(key);
    return this.parseField(field, config.fields.find(f => f.key === field.fullKey)?.value);
  }

  public accessByFullKey(config: KVConfig, fullKey: string): any {
    const field = this.obtainFieldByFullKey(fullKey);
    return this.parseField(field, config.fields.find(f => f.key === field.fullKey)?.value);
  }

  /**
   * Parse and access a field in the config. Returns undefined if the field is missing.
   */
  public accessPartial<TKey extends keyof TKVConfigSchema & string>(
    config: KVConfig,
    key: TKey,
  ): TKVConfigSchema[TKey]["type"] | undefined {
    const field = this.obtainField(key);
    return this.parseFieldWithoutDefault(
      field,
      config.fields.find(f => f.key === field.fullKey)?.value,
    );
  }

  /**
   * Gets a slice of the config schema with the given key patterns. Support syntax:
   *
   * - `some.namespace.key`: Matches exactly `some.namespace.key`
   * - `some.namespace.*`: Matches anything that starts with `some.namespace.`
   */
  public sliced<TKeyPattern extends (keyof TKVConfigSchema & string) | `${string}.*` | "*">(
    ...patterns: TKeyPattern[]
  ): KVConfigSchematics<
    TKVFieldValueTypeLibraryMap,
    {
      [TKey in KeyPatternMatch<keyof TKVConfigSchema, TKeyPattern>]: TKVConfigSchema[TKey];
    }
  > {
    type Pattern =
      | {
          type: "exact";
          value: string;
        }
      | {
          type: "prefix";
          value: string;
        };
    const parsedPatterns: Array<Pattern> = patterns.map(p => {
      if (p.endsWith("*")) {
        return { type: "prefix", value: p.substring(0, p.length - 1) };
      }
      return { type: "exact", value: p };
    });
    const newFields = new Map<string, KVConcreteFieldSchema>();
    for (const [key, field] of this.fields.entries()) {
      for (const pattern of parsedPatterns) {
        if (
          (pattern.type === "exact" && key === pattern.value) ||
          (pattern.type === "prefix" && key.startsWith(pattern.value))
        ) {
          newFields.set(key, field);
        }
      }
    }
    return new KVConfigSchematics(this.valueTypeLibrary, newFields, this.extensionPrefixes);
  }

  /**
   * Get a subset of the config schema with a specific scope.
   */
  public scoped<TScopeKey extends string>(
    scopeKey: TScopeKey,
  ): KVConfigSchematics<
    TKVFieldValueTypeLibraryMap,
    {
      [TKey in keyof TKVConfigSchema & string as TKey extends `${TScopeKey}.${infer RInnerKey}`
        ? RInnerKey
        : never]: TKVConfigSchema[TKey];
    }
  > {
    const newFields = new Map<string, KVConcreteFieldSchema>();
    for (const [key, field] of this.fields.entries()) {
      if (key.startsWith(`${scopeKey}.`)) {
        newFields.set(key.substring(scopeKey.length + 1), field);
      }
    }
    return new KVConfigSchematics(this.valueTypeLibrary, newFields, this.extensionPrefixes);
  }

  public union<TOtherKVConfigSchema extends KVVirtualConfigSchema>(
    other: KVConfigSchematics<
      TKVFieldValueTypeLibraryMap, // Must be the same
      TOtherKVConfigSchema
    >,
  ): KVConfigSchematics<TKVFieldValueTypeLibraryMap, TKVConfigSchema & TOtherKVConfigSchema> {
    const newFields = new Map<string, KVConcreteFieldSchema>();
    for (const [key, field] of this.fields.entries()) {
      newFields.set(key, field);
    }
    for (const [key, field] of other.fields.entries()) {
      if (newFields.has(key)) {
        throw new Error(
          "Cannot union two KVConfigSchematics. The following key is duplicated: " + key,
        );
      }
      newFields.set(key, field);
    }
    return new KVConfigSchematics(this.valueTypeLibrary, newFields, [
      ...this.extensionPrefixes,
      ...other.extensionPrefixes,
    ]);
  }

  /**
   * Combine baseKey into the fields. Effectively removes the baseKey.
   */
  public flattenBaseKey() {
    const newFields = new Map<string, KVConcreteFieldSchema>();
    for (const field of this.fields.values()) {
      newFields.set(field.fullKey, field);
    }
    return new KVConfigSchematics(this.valueTypeLibrary, newFields, this.extensionPrefixes);
  }

  public parseToMap(config: KVConfig) {
    const rawConfigMap = kvConfigToMap(config);
    const parsedConfigMap = new Map<string, any>();
    for (const [key, field] of this.fields.entries()) {
      const value = rawConfigMap.get(field.fullKey);
      const parsedValue = this.parseField(field, value);
      parsedConfigMap.set(key, parsedValue);
    }
    return parsedConfigMap;
  }

  public parseToMapWithFullKey(config: KVConfig) {
    const rawConfigMap = kvConfigToMap(config);
    const parsedConfigMap = new Map<string, any>();
    for (const field of this.fields.values()) {
      const value = rawConfigMap.get(field.fullKey);
      const parsedValue = this.parseField(field, value);
      parsedConfigMap.set(field.fullKey, parsedValue);
    }
    return parsedConfigMap;
  }

  public parseToMapPartial(config: KVConfig) {
    const rawConfigMap = kvConfigToMap(config);
    const parsedConfigMap = new Map<string, any>();
    for (const [key, field] of this.fields.entries()) {
      const value = rawConfigMap.get(field.fullKey);
      const parsedValue = this.parseFieldWithoutDefault(field, value);
      if (parsedValue !== undefined) {
        parsedConfigMap.set(key, parsedValue);
      }
    }
    return parsedConfigMap;
  }

  /**
   * Parse the given config to a ParsedKVConfig. **Will throw** if the config does not satisfy the
   * schema.
   */
  public parse(config: KVConfig): ParsedKVConfig<TKVConfigSchema> {
    return ParsedKVConfig[createParsedKVConfig](this.parseToMap(config));
  }

  public parsePartial(config: KVConfig): PartialParsedKVConfig<TKVConfigSchema> {
    return PartialParsedKVConfig[createParsedKVConfig](this.parseToMapPartial(config));
  }

  /**
   * Builds a full KV config from the given values record. **Will throw** if any of the values are
   * missing or do not satisfy the schema.
   */
  public buildFullConfig(valuesRecord: {
    [TKey in keyof TKVConfigSchema & string]?: TKVConfigSchema[TKey]["type"];
  }): KVConfig {
    return {
      fields: Array.from(this.fields.entries()).map(([key, field]) => {
        const value = this.parseField(field, valuesRecord[key]);
        return { key: field.fullKey, value };
      }),
    };
  }

  /**
   * Builds a partial KV config from the given values record. Will leave holes in the config if the
   * values are missing. **Will throw** if any of the values do not satisfy the schema.
   */
  public buildPartialConfig(valuesRecord: {
    [TKey in keyof TKVConfigSchema & string]?: TKVConfigSchema[TKey]["type"] | undefined;
  }): KVConfig {
    return {
      fields: Object.entries(valuesRecord)
        .filter(([_key, value]) => value !== undefined)
        .map(([key, value]) => {
          const field = this.obtainField(key);
          return { key: field.fullKey, value: this.parseField(field, value) };
        }),
    };
  }

  public createBuildPartialConfigInput(): {
    [TKey in keyof TKVConfigSchema & string]?: TKVConfigSchema[TKey]["type"] | undefined;
  } {
    return {};
  }

  public configBuilder(): KVConfigBuilder<TKVConfigSchema> {
    return new KVConfigBuilder(this.fields);
  }

  public clone(): KVConfigSchematics<TKVFieldValueTypeLibraryMap, TKVConfigSchema> {
    return new KVConfigSchematics(
      this.valueTypeLibrary,
      new Map(this.fields),
      this.extensionPrefixes,
    );
  }

  public withTypeParamOverride<
    TKey extends keyof TKVConfigSchema & string,
    TParam extends TKVFieldValueTypeLibraryMap[TKVConfigSchema[TKey]["valueTypeKey"]]["param"],
  >(key: TKey, paramMapper: (oldParam: TParam) => TParam) {
    const field = this.obtainField(key);
    const clone = this.clone();
    clone.fields.set(key, {
      ...field,
      valueTypeParams: paramMapper(field.valueTypeParams),
      schema: this.valueTypeLibrary.getSchema(
        field.valueTypeKey,
        paramMapper(field.valueTypeParams),
      ),
    });
    return clone;
  }

  /**
   * Cached full key map
   */
  private fullKepMap: Map<string, KVConcreteFieldSchema> | undefined = undefined;

  private getFullKeyMap(): Map<string, KVConcreteFieldSchema> {
    if (this.fullKepMap !== undefined) {
      return this.fullKepMap;
    }
    this.fullKepMap = new Map([...this.fields.values()].map(field => [field.fullKey, field]));
    return this.fullKepMap;
  }

  /**
   * Cached lenient zod schema
   */
  private lenientZodSchema: ZodSchema<KVConfig> | undefined = undefined;

  private makeLenientZodSchema(): ZodSchema<KVConfig> {
    const fullKeyMap = this.getFullKeyMap();
    return kvConfigSchema.transform(value => {
      const seenKeys = new Set<string>();
      return {
        fields: value.fields.filter(field => {
          if (this.extensionPrefixes.some(prefix => field.key.startsWith(prefix))) {
            // If we matched an extension prefix, we don't care about the key or value type. Just
            // allow it.
            return true;
          }
          if (seenKeys.has(field.key)) {
            return false;
          }
          const fieldDef = fullKeyMap.get(field.key);
          if (fieldDef === undefined) {
            return false;
          }
          const parsed = fieldDef.schema.safeParse(field.value);
          if (!parsed.success) {
            return false;
          }
          seenKeys.add(field.key);
          return true;
        }),
      };
    });
  }

  /**
   * Makes a zod schema that parses a KVConfig which only allows fields with correct keys and types
   * through.
   *
   * Will filter out any fields that are not in the schema.
   */
  public getLenientZodSchema(): ZodSchema<KVConfig> {
    if (this.lenientZodSchema !== undefined) {
      return this.lenientZodSchema;
    }
    this.lenientZodSchema = this.makeLenientZodSchema();
    return this.lenientZodSchema;
  }

  public getValueType<TKey extends (keyof TKVConfigSchema & string) | string>(
    key: TKey,
  ): TKey extends keyof TKVConfigSchema & string
    ? TKVConfigSchema[TKey]["valueTypeKey"]
    : null | TKVConfigSchema[keyof TKVConfigSchema]["valueTypeKey"] {
    const field = this.fields.get(key);
    if (field === undefined) {
      return null as any;
    }
    return field.valueTypeKey as any;
  }

  public getValueTypeParam<TKey extends (keyof TKVConfigSchema & string) | string>(
    key: TKey,
  ): TKey extends keyof TKVConfigSchema & string
    ? TKVFieldValueTypeLibraryMap[TKVConfigSchema[TKey]["valueTypeKey"]]["param"]
    : null | TKVFieldValueTypeLibraryMap[keyof TKVFieldValueTypeLibraryMap]["param"] {
    const field = this.fields.get(key);
    if (field === undefined) {
      return null as any;
    }
    return field.valueTypeParams as any;
  }

  public getValueTypeParamByFullKey(
    key: string,
  ): TKVFieldValueTypeLibraryMap[keyof TKVFieldValueTypeLibraryMap]["param"] {
    const field = this.getFullKeyMap().get(key);
    if (field === undefined) {
      throw new Error(`Field with key ${key} does not exist in the schematics`);
    }
    return field.valueTypeParams;
  }

  public hasFullKey(key: string): boolean {
    const field = this.getFullKeyMap().get(key);
    return field !== undefined;
  }

  /**
   * Given a KVConfig, filter it to only include fields that are in the schematics.
   */
  public filterConfig(
    config: KVConfig,
    additionalFilter?: ConfigFieldFilter<TKVFieldValueTypeLibraryMap>,
  ): KVConfig {
    const fullKeyMap = this.getFullKeyMap();
    return {
      fields: config.fields.filter(configField => {
        const field = fullKeyMap.get(configField.key);
        if (field === undefined) {
          return false;
        }
        if (additionalFilter !== undefined) {
          return additionalFilter(field.fullKey, {
            type: field.valueTypeKey,
            param: field.valueTypeParams,
          });
        }
        return true;
      }),
    };
  }

  /**
   * Given a KVConfigStack, filter it to only include fields that are in the schematics.
   */
  public filterStack(stack: KVConfigStack): KVConfigStack {
    return {
      layers: stack.layers.map(layer => ({
        layerName: layer.layerName,
        config: this.filterConfig(layer.config),
      })),
    };
  }

  public twoWayFilterConfig(
    config: KVConfig,
    additionalFilter?: ConfigFieldFilter<TKVFieldValueTypeLibraryMap>,
  ): readonly [included: KVConfig, excluded: KVConfig] {
    const includedFields: Array<KVConfig["fields"][number]> = [];
    const excludedFields: Array<KVConfig["fields"][number]> = [];
    const fullKeyMap = this.getFullKeyMap();
    for (const configField of config.fields) {
      const field = fullKeyMap.get(configField.key);
      let include = field !== undefined;
      if (field !== undefined && additionalFilter !== undefined) {
        include = additionalFilter(field.fullKey, {
          type: field.valueTypeKey,
          param: field.valueTypeParams,
        });
      }
      if (include) {
        includedFields.push(configField);
      } else {
        excludedFields.push(configField);
      }
    }
    return [{ fields: includedFields }, { fields: excludedFields }];
  }

  /**
   * Given a list of keys, filter it to only include keys that are in the schematics.
   */
  public filterFullKeys(keys: ReadonlyArray<string>): Array<string> {
    const fullKeyMap = this.getFullKeyMap();
    return keys.filter(key => fullKeyMap.has(key));
  }

  /**
   * Compares two KV config. Compare with "effective equals". Only compare fields in the schematics.
   * Does not apply defaults.
   */
  public configEffectiveEquals(a: KVConfig, b: KVConfig) {
    const aMap = kvConfigToMap(a);
    const bMap = kvConfigToMap(b);

    for (const field of this.fields.values()) {
      const aValue = aMap.get(field.fullKey);
      const bValue = bMap.get(field.fullKey);
      if (aValue === undefined) {
        if (bValue === undefined) {
          // Both are missing, continue
          continue;
        } else {
          return false;
        }
      }
      this.valueTypeLibrary.effectiveEquals(
        field.valueTypeKey,
        field.valueTypeParams,
        aValue,
        bValue,
      );
    }

    return true;
  }

  /**
   * Compares two KV config field. Compare with "effective equals". Can only compare fields in the
   * schematics.
   */
  public fieldEffectiveEquals<TKey extends keyof TKVConfigSchema & string>(
    key: TKey,
    a: TKVConfigSchema[TKey]["type"],
    b: TKVConfigSchema[TKey]["type"],
  ) {
    const field = this.obtainField(key);
    return this.valueTypeLibrary.effectiveEquals(
      field.valueTypeKey,
      field.valueTypeParams,
      field.schema.parse(a),
      field.schema.parse(b),
    );
  }

  public fieldEffectiveEqualsWithFullKey(fullKey: string, a: any, b: any) {
    const fullKeyMap = this.getFullKeyMap();
    const field = fullKeyMap.get(fullKey);
    if (field === undefined) {
      throw new Error(`Field with key ${fullKey} does not exist in the schematics`);
    }
    return this.valueTypeLibrary.effectiveEquals(
      field.valueTypeKey,
      field.valueTypeParams,
      field.schema.parse(a),
      field.schema.parse(b),
    );
  }

  private makeInternalFieldStringifyOpts(opts: FieldStringifyOpts): InnerFieldStringifyOpts {
    return {
      t: opts.t ?? ((_key, fallback) => fallback),
      desiredLength: opts.desiredLength,
    };
  }

  public stringifyField<TKey extends keyof TKVConfigSchema & string>(
    key: TKey,
    value: TKVConfigSchema[TKey]["type"],
    opts: FieldStringifyOpts = {},
  ) {
    const field = this.obtainField(key);
    return this.valueTypeLibrary.stringify(
      field.valueTypeKey,
      field.valueTypeParams,
      this.makeInternalFieldStringifyOpts(opts),
      value,
    );
  }

  public tryStringifyFieldWithFullKey(
    key: string,
    value: any,
    opts: FieldStringifyOpts,
  ): string | null {
    const fullKeyMap = this.getFullKeyMap();
    const field = fullKeyMap.get(key);
    if (field === undefined) {
      return null;
    }
    return this.valueTypeLibrary.stringify(
      field.valueTypeKey,
      field.valueTypeParams,
      this.makeInternalFieldStringifyOpts(opts),
      value,
    );
  }

  /**
   * Apply config in patch to target. Only apply fields that are in the schematics.
   */
  public apply(target: KVConfig, patch: KVConfig) {
    const filteredPatch = this.filterConfig(patch);
    return collapseKVStackRaw([target, filteredPatch]);
  }

  /**
   * Tries to un-apply the patch from the target. Will only un-apply fields that are in the
   * schematics.
   *
   * If the value in the target is not effective equal to the value in the patch, it will not be
   * removed.
   */
  public unApply(target: KVConfig, patch: KVConfig) {
    const filteredPatch = this.filterConfig(patch);
    const patchMap = kvConfigToMap(filteredPatch);
    const newMap = new Map(kvConfigToMap(target));
    const fullKeyMap = this.getFullKeyMap();
    for (const [key, value] of patchMap.entries()) {
      const field = fullKeyMap.get(key);
      if (field === undefined) {
        continue;
      }
      const targetValue = newMap.get(key);
      if (targetValue !== undefined) {
        if (
          !this.valueTypeLibrary.effectiveEquals(
            field.valueTypeKey,
            field.valueTypeParams,
            value,
            targetValue,
          )
        ) {
          continue;
        }
        newMap.delete(key);
      }
    }
    return mapToKVConfig(newMap);
  }

  /**
   * Given a KVConfig, iterate through all the fields that are in the schematics. Keys will be full
   * keys.
   */
  public *iterateFieldsOfConfig(config: KVConfig): Generator<[string, any]> {
    const fullKeyMap = this.getFullKeyMap();
    for (const { key, value } of config.fields) {
      const field = fullKeyMap.get(key);
      if (field !== undefined) {
        yield [key, value];
      }
    }
  }

  /**
   * Given a KVConfig, iterate through all the fields that are in the schematics.
   */
  public *fullKeys(): Generator<string> {
    const fullKeyMap = this.getFullKeyMap();
    for (const key of fullKeyMap.keys()) {
      yield key;
    }
  }

  /**
   * Effectively compare two KV config, and return full keys of fields that are different.
   */
  public effectiveCompareConfig(
    a: KVConfig,
    b: KVConfig,
    opts: {
      fieldFilter?: ConfigFieldFilter<TKVFieldValueTypeLibraryMap>;
    } = {},
  ): { onlyInA: Array<string>; onlyInB: Array<string>; inBothButDifferent: Array<string> } {
    const { fieldFilter } = opts;
    const aMap = kvConfigToMap(a);
    const bMap = kvConfigToMap(b);
    const onlyInA: Array<string> = [];
    const onlyInB: Array<string> = [];
    const inBothButDifferent: Array<string> = [];
    for (const field of this.fields.values()) {
      if (fieldFilter !== undefined) {
        if (
          !fieldFilter(field.fullKey, {
            type: field.valueTypeKey,
            param: field.valueTypeParams,
          })
        ) {
          continue;
        }
      }
      const aValue = aMap.get(field.fullKey);
      const bValue = bMap.get(field.fullKey);
      if (aValue === undefined) {
        if (bValue === undefined) {
          continue;
        } else {
          onlyInB.push(field.fullKey);
        }
      } else {
        if (bValue === undefined) {
          onlyInA.push(field.fullKey);
        } else {
          if (
            !this.valueTypeLibrary.effectiveEquals(
              field.valueTypeKey,
              field.valueTypeParams,
              aValue,
              bValue,
            )
          ) {
            inBothButDifferent.push(field.fullKey);
          }
        }
      }
    }
    return { onlyInA, onlyInB, inBothButDifferent };
  }

  public serialize(): SerializedKVConfigSchematics {
    return {
      fields: [...this.fields.entries()].map(([key, field]) => ({
        shortKey: key,
        fullKey: field.fullKey,
        typeKey: field.valueTypeKey,
        typeParams: field.valueTypeParams,
        defaultValue: field.defaultValue!,
      })),
      extensionPrefixes: this.extensionPrefixes,
    };
  }

  /**
   * Check if any of the fields in the schematics has a full key that starts with the given prefix.
   */
  public hasFieldsWithPrefix(prefix: string): boolean {
    for (const field of this.fields.values()) {
      if (field.fullKey.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  public static deserialize(
    valueTypeLibrary: KVFieldValueTypeLibrary<any>,
    serialized: SerializedKVConfigSchematics,
  ): KVConfigSchematics<any, KVVirtualConfigSchema> {
    const fields = new Map<string, KVConcreteFieldSchema>(
      serialized.fields.map(field => {
        const typeParams = valueTypeLibrary.parseParamTypes(field.typeKey, field.typeParams);
        const valueSchema = valueTypeLibrary.getSchema(field.typeKey, typeParams);
        return [
          field.shortKey,
          {
            valueTypeKey: field.typeKey,
            valueTypeParams: typeParams,
            schema: valueSchema,
            fullKey: field.fullKey,
            defaultValue: valueSchema.parse(field.defaultValue),
          },
        ];
      }),
    );
    return new KVConfigSchematics(valueTypeLibrary, fields, serialized.extensionPrefixes ?? []);
  }
  public static tryDeserialize(
    valueTypeLibrary: KVFieldValueTypeLibrary<any>,
    serialized: SerializedKVConfigSchematics,
  ): {
    schematics: KVConfigSchematics<any, KVVirtualConfigSchema>;
    errors: Array<KVConfigSchematicsDeserializationError>;
  } {
    const fields = new Map<string, KVConcreteFieldSchema>();
    const errors: Array<KVConfigSchematicsDeserializationError> = [];
    for (const field of serialized.fields) {
      try {
        const typeParams = valueTypeLibrary.parseParamTypes(field.typeKey, field.typeParams);
        const valueSchema = valueTypeLibrary.getSchema(field.typeKey, typeParams);
        fields.set(field.shortKey, {
          valueTypeKey: field.typeKey,
          valueTypeParams: typeParams,
          schema: valueSchema,
          fullKey: field.fullKey,
          defaultValue: valueSchema.parse(field.defaultValue),
        });
      } catch (error) {
        errors.push({
          fullKey: field.fullKey,
          error: serializeError(error),
        });
      }
    }
    return {
      schematics: new KVConfigSchematics(
        valueTypeLibrary,
        fields,
        serialized.extensionPrefixes ?? [],
      ),
      errors,
    };
  }
}

/**
 * Given a baseKey and a SerializedKVConfigSchematics, prepend the baseKey to the baseKey of the
 * schematics.
 */
export function prependBaseKeyToSerializedKVConfigSchematics(
  baseKey: string,
  serialized: SerializedKVConfigSchematics,
): SerializedKVConfigSchematics {
  return {
    fields: serialized.fields.map(field => ({
      ...field,
      shortKey: baseKey + field.shortKey,
    })),
  };
}

/**
 * Given a baseKey and a KVConfig. Strip the baseKey from the keys of the fields. If a fields does
 * not start with the baseKey, it will be ignored.
 */
export function stripBaseKeyFromKVConfig(baseKey: string, config: KVConfig): KVConfig {
  const baseKeyLength = baseKey.length;
  return {
    fields: config.fields
      .filter(field => field.key.startsWith(baseKey))
      .map(({ key, value }) => {
        return {
          key: key.substring(baseKeyLength),
          value,
        };
      }),
  };
}

export class KVConfigBuilder<TKVConfigSchema extends KVVirtualConfigSchema> {
  public constructor(private readonly fieldDefs: Map<string, KVConcreteFieldSchema>) {}
  private readonly fields: Map<string, any> = new Map();
  public with<TKey extends keyof TKVConfigSchema & string>(
    key: TKey,
    value: TKVConfigSchema[TKey]["type"],
  ) {
    const field = this.fieldDefs.get(key);
    if (field === undefined) {
      throw new Error(`Field with key ${key} does not exist in the schematics.`);
    }
    this.fields.set(field.fullKey, value);
    return this;
  }
  public build() {
    return mapToKVConfig(this.fields);
  }
}

/**
 * This class can be only constructed via the `parse` method on `KVConfigSchema`. It is guaranteed
 * to satisfy the schema.
 *
 * All fields that exist on the schematics is guaranteed to exist here.
 */
export class ParsedKVConfig<TKVConfigSchema extends KVVirtualConfigSchema> {
  private constructor(
    /**
     * Guaranteed to satisfy the schema.
     */
    private readonly configMap: Map<string, any>,
  ) {}

  /**
   * @internal
   */
  public static [createParsedKVConfig]<TKVConfigSchema extends KVVirtualConfigSchema>(
    configMap: Map<string, any>,
  ): ParsedKVConfig<TKVConfigSchema> {
    return new ParsedKVConfig(configMap);
  }

  public get<TKey extends keyof TKVConfigSchema & string>(
    key: TKey,
  ): TKVConfigSchema[TKey]["type"] {
    return this.configMap.get(key);
  }
}

/**
 * This class can be constructed via the `parsePartial` method on `KVConfigSchema`. All existing
 * fields are guaranteed to satisfy the schema. However, there may be missing fields.
 */
export class PartialParsedKVConfig<TKVConfigSchema extends KVVirtualConfigSchema> {
  private constructor(
    /**
     * Guaranteed to satisfy the schema.
     */
    private readonly configMap: Map<string, any>,
  ) {}

  public static [createParsedKVConfig]<TKVConfigSchema extends KVVirtualConfigSchema>(
    configMap: Map<string, any>,
  ): PartialParsedKVConfig<TKVConfigSchema> {
    return new PartialParsedKVConfig(configMap);
  }

  public get<TKey extends keyof TKVConfigSchema & string>(
    key: TKey,
  ): TKVConfigSchema[TKey]["type"] | undefined {
    return this.configMap.get(key);
  }

  public has<TKey extends keyof TKVConfigSchema & string>(key: TKey): boolean {
    return this.configMap.has(key);
  }
}

export function makeKVConfigFromFields(fields: Array<KVConfigField>): KVConfig {
  return { fields };
}

export function kvConfigField(key: string, value: any): KVConfigField {
  return { key, value };
}

export function kvConfigToFields(config: KVConfig): Array<KVConfigField> {
  return config.fields;
}

export function kvConfigToMap(config: KVConfig): Map<string, any> {
  return new Map(config.fields.map(f => [f.key, f.value]));
}

export function mapToKVConfig(map: Map<string, any>): KVConfig {
  return {
    fields: Array.from(map.entries()).map(([key, value]) => ({ key, value })),
  };
}

export function collapseKVStack(stack: KVConfigStack): KVConfig {
  const map: Map<string, any> = new Map();
  for (const layer of stack.layers) {
    for (const { key, value } of layer.config.fields) {
      map.set(key, value);
    }
  }
  return mapToKVConfig(map);
}

export function collapseKVStackRaw(configs: Array<KVConfig>): KVConfig {
  const map: Map<string, any> = new Map();
  for (const config of configs) {
    for (const { key, value } of config.fields) {
      map.set(key, value);
    }
  }
  return mapToKVConfig(map);
}

export const emptyKVConfig: KVConfig = {
  fields: [],
};

export const emptyKVConfigStack: KVConfigStack = {
  layers: [],
};

export function singleLayerKVConfigStackOf(
  name: KVConfigLayerName,
  config: KVConfig,
): KVConfigStack {
  return {
    layers: [
      {
        layerName: name,
        config,
      },
    ],
  };
}

/**
 * Given a KVConfigStack, add a new layer to the top of the stack. Does not mutate the original
 * stack.
 */
export function addKVConfigToStack(
  stack: KVConfigStack,
  newLayerName: KVConfigLayerName,
  newLayerConfig: KVConfig,
): KVConfigStack {
  return {
    layers: [
      ...stack.layers,
      {
        layerName: newLayerName,
        config: newLayerConfig,
      },
    ],
  };
}

/**
 * Given a KVConfig, add a new layer to the base of the stack. Does not mutate the original stack.
 */
export function addKVConfigToBaseOfStack(
  stack: KVConfigStack,
  newLayerName: KVConfigLayerName,
  newLayerConfig: KVConfig,
): KVConfigStack {
  return {
    layers: [
      {
        layerName: newLayerName,
        config: newLayerConfig,
      },
      ...stack.layers,
    ],
  };
}

export function combineKVStack(stacks: Array<KVConfigStack>): KVConfigStack {
  return {
    layers: stacks.flatMap(s => s.layers),
  };
}

export function filterKVConfig(
  config: KVConfig,
  predicate: (key: string, value: any) => boolean,
): KVConfig {
  return {
    fields: config.fields.filter(f => predicate(f.key, f.value)),
  };
}

export function deepEquals<T>(a: T, b: T) {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a)) {
    if (a.length !== (b as any)?.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], (b as any)[i])) {
        return false;
      }
    }
    return true;
  }
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(b));
  if (aKeys.size !== bKeys.size) {
    return false;
  }
  for (const key of aKeys) {
    if (!bKeys.has(key)) {
      return false;
    }
    if (!deepEquals((a as any)[key], (b as any)[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Compare two config KV config subject to a schema. Only the fields that exist in the schematic
 * is compared. Default values are used for missing fields. (Meaning having a field with the same
 * value as the default value is considered equal to not having the field at all.)
 */
export function kvConfigEquals(schematics: KVConfigSchematics<any, any>, a: KVConfig, b: KVConfig) {
  const aMap = schematics.parseToMap(a);
  const bMap = schematics.parseToMap(b);

  for (const [aKey, aValue] of aMap) {
    const bValue = bMap.get(aKey);
    if (bValue === undefined) {
      return false;
    }
    if (!deepEquals(aValue, bValue)) {
      return false;
    }
  }

  return true;
}

/**
 * Gets all keys of a union type.
 */
type UnionKeyOf<T> = T extends T ? keyof T : never;

/**
 * Given a ConfigSchematic, gets the internal virtual schema with shortened keys.
 */
export type InferConfigSchemaMap<TKVConfigSchematics extends KVConfigSchematics<any, any>> =
  TKVConfigSchematics extends KVConfigSchematics<any, infer RSchema> ? RSchema : never;

/**
 * Given a ConfigSchematic, gets the shortened keys of the internal virtual schema.
 */
export type InferConfigSchemaKeys<TKVConfigSchematics extends KVConfigSchematics<any, any>> =
  UnionKeyOf<InferConfigSchemaMap<TKVConfigSchematics>>;

export type InferValueTypeMap<TLibrary extends KVFieldValueTypeLibrary<any>> =
  TLibrary extends KVFieldValueTypeLibrary<infer RMap> ? RMap : never;

export type InferValueTypeKeys<TLibrary extends KVFieldValueTypeLibrary<any>> = UnionKeyOf<
  InferValueTypeMap<TLibrary>
>;

export type ConfigFieldFilter<TKVFieldValueTypeLibraryMap extends KVVirtualFieldValueTypesMapping> =
  (
    fullKey: string,
    valueTypeDescriptor: {
      [TType in keyof TKVFieldValueTypeLibraryMap]: {
        type: TType;
        param: TKVFieldValueTypeLibraryMap[TType]["param"];
      };
    }[keyof TKVFieldValueTypeLibraryMap],
  ) => boolean;

export type InferConfigFieldFilter<TKVConfigSchematics extends KVConfigSchematics<any, any>> =
  TKVConfigSchematics extends KVConfigSchematics<infer RMap, any> ? ConfigFieldFilter<RMap> : never;
