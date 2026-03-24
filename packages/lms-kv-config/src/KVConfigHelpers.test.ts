import { z } from "zod";
import {
  KVConfigSchematicsBuilder,
  KVFieldValueTypesLibraryBuilder,
  addKVConfigToBaseOfStack,
  addKVConfigToStack,
  collapseKVStack,
  collapseKVStackRaw,
  combineKVStack,
  emptyKVConfig,
  emptyKVConfigStack,
  filterKVConfig,
  kvConfigEquals,
  kvConfigField,
  kvConfigToFields,
  kvConfigToMap,
  makeKVConfigFromFields,
  mapToKVConfig,
  prependBaseKeyToSerializedKVConfigSchematics,
  singleLayerKVConfigStackOf,
  stripBaseKeyFromKVConfig,
} from "./KVConfig.js";

function createNumLibrary() {
  return new KVFieldValueTypesLibraryBuilder({})
    .valueType("num", {
      paramType: {},
      schemaMaker: () => z.number(),
      effectiveEquals: (a, b) => a === b,
      stringify: value => String(value),
    })
    .build();
}

describe("KVConfig helper functions", () => {
  it("kvConfigField/makeKVConfigFromFields/kvConfigToFields round trip", () => {
    const field = kvConfigField("a", 1);
    const config = makeKVConfigFromFields([field]);
    expect(kvConfigToFields(config)).toEqual([field]);
  });

  it("kvConfigToMap and mapToKVConfig round trip", () => {
    const config = makeKVConfigFromFields([kvConfigField("a", 1), kvConfigField("b", 2)]);
    const map = kvConfigToMap(config);
    expect(map.get("a")).toBe(1);
    const rebuilt = mapToKVConfig(map);
    expect(rebuilt.fields).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
  });

  it("singleLayerKVConfigStackOf collapses to the same config", () => {
    const config = makeKVConfigFromFields([kvConfigField("a", 1)]);
    const stack = singleLayerKVConfigStackOf("instance", config);
    expect(collapseKVStack(stack)).toEqual(config);
  });

  it("collapseKVStack applies layers in order", () => {
    const stack = {
      layers: [
        { layerName: "instance" as const, config: makeKVConfigFromFields([kvConfigField("a", 1)]) },
        {
          layerName: "apiOverride" as const,
          config: makeKVConfigFromFields([kvConfigField("a", 2), kvConfigField("b", 3)]),
        },
      ],
    };
    const collapsed = collapseKVStack(stack);
    const map = kvConfigToMap(collapsed);
    expect(map.get("a")).toBe(2);
    expect(map.get("b")).toBe(3);
  });

  it("collapseKVStackRaw applies later configs last", () => {
    const collapsed = collapseKVStackRaw([
      makeKVConfigFromFields([kvConfigField("a", 1)]),
      makeKVConfigFromFields([kvConfigField("a", 2)]),
    ]);
    expect(kvConfigToMap(collapsed).get("a")).toBe(2);
  });

  it("stack helpers preserve order", () => {
    const base = singleLayerKVConfigStackOf(
      "instance",
      makeKVConfigFromFields([kvConfigField("a", 1)]),
    );
    const withTop = addKVConfigToStack(base, "apiOverride", makeKVConfigFromFields([]));
    expect(withTop.layers.map(layer => layer.layerName)).toEqual(["instance", "apiOverride"]);

    const withBase = addKVConfigToBaseOfStack(base, "hardware", makeKVConfigFromFields([]));
    expect(withBase.layers.map(layer => layer.layerName)).toEqual(["hardware", "instance"]);

    const combined = combineKVStack([base, withTop]);
    expect(combined.layers.length).toBe(3);
  });

  it("addKVConfigToStack vs addKVConfigToBaseOfStack affects precedence", () => {
    const base = singleLayerKVConfigStackOf(
      "instance",
      makeKVConfigFromFields([kvConfigField("a", 1)]),
    );
    const top = addKVConfigToStack(
      base,
      "apiOverride",
      makeKVConfigFromFields([kvConfigField("a", 2)]),
    );
    const bottom = addKVConfigToBaseOfStack(
      base,
      "hardware",
      makeKVConfigFromFields([kvConfigField("a", 3)]),
    );
    expect(kvConfigToMap(collapseKVStack(top)).get("a")).toBe(2);
    expect(kvConfigToMap(collapseKVStack(bottom)).get("a")).toBe(1);
  });

  it("combineKVStack preserves layer order when collapsed", () => {
    const first = singleLayerKVConfigStackOf(
      "instance",
      makeKVConfigFromFields([kvConfigField("a", 1)]),
    );
    const second = singleLayerKVConfigStackOf(
      "apiOverride",
      makeKVConfigFromFields([kvConfigField("a", 2)]),
    );
    const combined = combineKVStack([first, second]);
    expect(kvConfigToMap(collapseKVStack(combined)).get("a")).toBe(2);
  });

  it("filterKVConfig filters by predicate", () => {
    const config = makeKVConfigFromFields([kvConfigField("a", 1), kvConfigField("b", 2)]);
    const filtered = filterKVConfig(config, key => key === "a");
    expect(filtered.fields).toEqual([{ key: "a", value: 1 }]);
  });

  it("empty config constants are empty", () => {
    expect(emptyKVConfig.fields).toEqual([]);
    expect(emptyKVConfigStack.layers).toEqual([]);
  });

  it("kvConfigEquals treats missing fields as defaults", () => {
    const library = createNumLibrary();
    const schematics = new KVConfigSchematicsBuilder(library).field("a", "num", {}, 1).build();
    const a = makeKVConfigFromFields([]);
    const b = makeKVConfigFromFields([kvConfigField("a", 1)]);
    const c = makeKVConfigFromFields([kvConfigField("a", 2)]);
    expect(kvConfigEquals(schematics, a, b)).toBe(true);
    expect(kvConfigEquals(schematics, a, c)).toBe(false);
  });

  it("prependBaseKeyToSerializedKVConfigSchematics only changes shortKey", () => {
    const serialized = {
      fields: [
        {
          shortKey: "a",
          fullKey: "root.a",
          typeKey: "num",
          typeParams: {},
          defaultValue: 1,
        },
      ],
    };
    const prefixed = prependBaseKeyToSerializedKVConfigSchematics("base.", serialized);
    expect(prefixed.fields[0].shortKey).toBe("base.a");
    expect(prefixed.fields[0].fullKey).toBe("root.a");
  });

  it("stripBaseKeyFromKVConfig removes non-matching keys and strips prefix", () => {
    const config = makeKVConfigFromFields([
      kvConfigField("base.a", 1),
      kvConfigField("other", 2),
    ]);
    const stripped = stripBaseKeyFromKVConfig("base.", config);
    expect(stripped.fields).toEqual([{ key: "a", value: 1 }]);
  });
});
