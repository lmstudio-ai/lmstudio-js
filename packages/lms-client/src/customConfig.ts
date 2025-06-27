import {
  type BasicKVFieldValueTypeLibraryMap,
  KVConfigSchematicsBuilder,
  kvValueTypesLibrary,
} from "@lmstudio/lms-kv-config";

/**
 * @public
 */
export type VirtualConfigSchematics = {
  [key: string]: {
    key: string;
    type: any;
    valueTypeKey: string;
  };
};

export const configSchematicsBrand = Symbol("ConfigSchematics");
/**
 * @public
 */
export interface ConfigSchematics<TVirtualConfigSchematics extends VirtualConfigSchematics> {
  [configSchematicsBrand]?: TVirtualConfigSchematics;
}

export const parsedConfigBrand = Symbol("ConfigSchematics");
/**
 * @public
 */
export interface ParsedConfig<TVirtualConfigSchematics extends VirtualConfigSchematics> {
  [configSchematicsBrand]?: TVirtualConfigSchematics;
  get<TKey extends keyof TVirtualConfigSchematics & string>(
    key: TKey,
  ): TVirtualConfigSchematics[TKey]["type"];
}

export const configSchematicsBuilderBrand = Symbol("ConfigSchematicsBuilder");
/**
 * The opaque type for KVConfigSchematicsBuilder that is exposed in lmstudio.js SDK. Notably, this
 * has significantly simplified types and is easier to use.
 *
 * @public
 */
export interface ConfigSchematicsBuilder<TVirtualConfigSchematics extends VirtualConfigSchematics> {
  [configSchematicsBuilderBrand]?: TVirtualConfigSchematics;
  /**
   * Adds a field to the config schematics.
   */
  field<TKey extends string, TValueTypeKey extends keyof BasicKVFieldValueTypeLibraryMap & string>(
    key: TKey,
    valueTypeKey: TValueTypeKey,
    valueTypeParams: BasicKVFieldValueTypeLibraryMap[TValueTypeKey]["param"],
    defaultValue: BasicKVFieldValueTypeLibraryMap[TValueTypeKey]["value"],
  ): ConfigSchematicsBuilder<
    TVirtualConfigSchematics & {
      [key in TKey]: {
        key: TKey;
        type: BasicKVFieldValueTypeLibraryMap[TValueTypeKey]["value"];
        valueTypeKey: TValueTypeKey;
      };
    }
  >;
  /**
   * Adds a "scope" to the config schematics. This is useful for grouping fields together.
   */
  scope<TScopeKey extends string, TInnerVirtualConfigSchematics extends VirtualConfigSchematics>(
    scopeKey: TScopeKey,
    fn: (
      builder: ConfigSchematicsBuilder<{}>,
    ) => ConfigSchematicsBuilder<TInnerVirtualConfigSchematics>,
  ): ConfigSchematicsBuilder<
    TVirtualConfigSchematics & {
      [InnerKey in keyof TInnerVirtualConfigSchematics &
        string as `${TScopeKey}.${InnerKey}`]: TInnerVirtualConfigSchematics[InnerKey];
    }
  >;
  build(): ConfigSchematics<TVirtualConfigSchematics>;
}

/**
 * @public
 */
export function createConfigSchematics(): ConfigSchematicsBuilder<{}> {
  return new KVConfigSchematicsBuilder(kvValueTypesLibrary) as ConfigSchematicsBuilder<{}>;
}

/**
 * Given the type of a configSchematics, returns the type of the parsed config. Example usage:
 *
 * ```ts
 * const config: InferParsedConfig<typeof configSchematics> = ctl.getPluginConfig(configSchematics);
 * ```
 *
 * @remarks
 *
 * You don't need this type in the above case because TypeScript has type inferencing. It is mainly
 * useful when you want to pass the parsed config around and you need to type the parameter.
 *
 * @public
 */
export type InferParsedConfig<TConfigSchematics extends ConfigSchematics<any>> =
  TConfigSchematics extends ConfigSchematics<infer RVirtualConfigSchematics>
    ? ParsedConfig<RVirtualConfigSchematics>
    : never;
