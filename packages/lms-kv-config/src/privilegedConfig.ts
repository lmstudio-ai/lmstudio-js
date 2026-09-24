import { globalConfigSchematics, type TypedConfigSchematics } from "./schema.js";

/** Classifies full keys using the host's authoritative schema, including engine-inactive fields. */
export function requiresPrivilegedConfigWrite(
  key: string,
  schematics: TypedConfigSchematics = globalConfigSchematics,
): boolean {
  return (
    schematics.hasFullKey(key) &&
    schematics.getValueTypeParamByFullKey(key).requiresPrivilegedWrite === true
  );
}
