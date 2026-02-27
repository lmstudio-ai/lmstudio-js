import { z } from "zod";
import {
  KVConfigSchematics,
  KVConfigSchematicsBuilder,
  KVFieldValueTypesLibraryBuilder,
  addKVConfigToStack,
  collapseKVStackRaw,
  kvConfigField,
  kvConfigToMap,
  makeKVConfigFromFields,
} from "./KVConfig.js";

function createTestLibrary() {
  return new KVFieldValueTypesLibraryBuilder({})
    .valueType("num", {
      paramType: {
        min: z.number().optional(),
      },
      schemaMaker: ({ min }) => {
        let schema = z.number();
        if (min !== undefined) {
          schema = schema.min(min);
        }
        return schema;
      },
      effectiveEquals: (a, b) => a === b,
      stringify: (value, _param, opts) => opts.t("test:num", "NUM") + ":" + value,
    })
    .valueType("str", {
      paramType: {},
      schemaMaker: () => z.string(),
      effectiveEquals: (a, b) => a === b,
      stringify: (value, _param, opts) => opts.t("test:str", "STR") + ":" + value,
    })
    .valueType("alwaysFalse", {
      paramType: {},
      schemaMaker: () => z.any(),
      effectiveEquals: () => false,
      stringify: value => String(value),
    })
    .build();
}

function createSchematics() {
  const library = createTestLibrary();
  const schematics = new KVConfigSchematicsBuilder(library)
    .extension("ext")
    .field("num", "num", { min: 0 }, 0)
    .field("name", "str", {}, "default")
    .field("flag", "alwaysFalse", {}, "x")
    .scope("group", builder =>
      builder.field("a", "num", { min: 0 }, 1).field("b", "str", {}, "b"),
    )
    .build();
  return { library, schematics };
}

describe("KVFieldValueTypesLibraryBuilder", () => {
  it("throws on duplicate value type keys", () => {
    const builder = new KVFieldValueTypesLibraryBuilder({});
    builder.valueType("num", {
      paramType: {},
      schemaMaker: () => z.number(),
      effectiveEquals: () => true,
      stringify: value => String(value),
    });
    expect(() =>
      builder.valueType("num", {
        paramType: {},
        schemaMaker: () => z.number(),
        effectiveEquals: () => true,
        stringify: value => String(value),
      }),
    ).toThrow("already exists");
  });
});

describe("KVConfigSchematicsBuilder", () => {
  it("validates default values", () => {
    const library = createTestLibrary();
    const builder = new KVConfigSchematicsBuilder(library);
    expect(() => builder.field("num", "num", { min: 0 }, -1)).toThrow(
      "Invalid default value",
    );
  });

  it("throws on duplicate field keys", () => {
    const library = createTestLibrary();
    const builder = new KVConfigSchematicsBuilder(library).field("a", "num", {}, 1);
    expect(() => builder.field("a", "num", {}, 2)).toThrow("already exists");
  });

  it("scopes keys and scoped schematics access uses short keys", () => {
    const library = createTestLibrary();
    const schematics = new KVConfigSchematicsBuilder(library)
      .scope("group", builder => builder.field("a", "num", {}, 1))
      .build();
    const scoped = schematics.scoped("group");
    const config = makeKVConfigFromFields([kvConfigField("group.a", 2)]);
    expect(scoped.access(config, "a")).toBe(2);
  });

  it("union throws on duplicate keys", () => {
    const library = createTestLibrary();
    const left = new KVConfigSchematicsBuilder(library).field("a", "num", {}, 1).build();
    const right = new KVConfigSchematicsBuilder(library).field("a", "num", {}, 2).build();
    expect(() => left.union(right)).toThrow("duplicated");
  });
});

describe("KVConfigSchematics core behavior", () => {
  it("sliced supports exact, prefix, and wildcard patterns", () => {
    const library = createTestLibrary();
    const schematics = new KVConfigSchematicsBuilder(library)
      .field("a", "num", {}, 1)
      .scope("group", builder => builder.field("b", "num", {}, 2))
      .build();

    const slicedExact = schematics.sliced("a");
    expect(slicedExact.hasFullKey("a")).toBe(true);
    expect(slicedExact.hasFullKey("group.b")).toBe(false);

    const slicedPrefix = schematics.sliced("group.*");
    expect(slicedPrefix.hasFullKey("group.b")).toBe(true);
    expect(slicedPrefix.hasFullKey("a")).toBe(false);

    const slicedAll = schematics.sliced("*");
    expect(slicedAll.hasFullKey("a")).toBe(true);
    expect(slicedAll.hasFullKey("group.b")).toBe(true);
  });

  it("scoped schematics can be flattened to full keys", () => {
    const { schematics } = createSchematics();
    const scoped = schematics.scoped("group");
    const flattened = scoped.flattenBaseKey();
    const config = makeKVConfigFromFields([kvConfigField("group.a", 3)]);
    expect(flattened.access(config, "group.a")).toBe(3);
  });

  it("parse uses defaults while parsePartial leaves missing fields undefined", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([]);
    expect(schematics.parse(config).get("num")).toBe(0);
    expect(schematics.parsePartial(config).get("num")).toBeUndefined();
  });

  it("PartialParsedKVConfig.has reflects presence of fields", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([kvConfigField("num", 1)]);
    const partial = schematics.parsePartial(config);
    expect(partial.has("num")).toBe(true);
    expect(partial.has("name")).toBe(false);
  });

  it("parse vs parsePartial: same config yields defaults only in parse", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([kvConfigField("num", 5)]);
    const parsed = schematics.parse(config);
    const partial = schematics.parsePartial(config);
    expect(parsed.get("name")).toBe("default");
    expect(partial.get("name")).toBeUndefined();
  });

  it("access/accessPartial/accessByFullKey behave as expected", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([kvConfigField("num", 4)]);
    expect(schematics.access(config, "num")).toBe(4);
    expect(schematics.accessPartial(config, "name")).toBeUndefined();
    expect(schematics.accessByFullKey(config, "num")).toBe(4);
  });

  it("getFieldsMap uses full keys", () => {
    const { schematics } = createSchematics();
    const fields = schematics.getFieldsMap();
    expect(fields.has("num")).toBe(true);
    expect(fields.has("group.a")).toBe(true);
    expect(fields.has("a")).toBe(false);
  });

  it("obtainField and obtainFieldByFullKey return matching full keys", () => {
    const { schematics } = createSchematics();
    expect(schematics.obtainField("num").fullKey).toBe("num");
    expect(schematics.obtainFieldByFullKey("group.a").fullKey).toBe("group.a");
  });

  it("getSchemaForKey returns a schema that enforces parameters", () => {
    const { schematics } = createSchematics();
    const schema = schematics.getSchemaForKey("num");
    expect(schema.safeParse(1).success).toBe(true);
    expect(schema.safeParse(-1).success).toBe(false);
  });

  it("parseToMap variants use short or full keys", () => {
    const { schematics } = createSchematics();
    const scoped = schematics.scoped("group");
    const config = makeKVConfigFromFields([kvConfigField("group.a", 5)]);

    const shortMap = scoped.parseToMap(config);
    const fullMap = scoped.parseToMapWithFullKey(config);

    expect(shortMap.get("a")).toBe(5);
    expect(fullMap.get("group.a")).toBe(5);
  });

  it("buildFullConfig uses defaults while buildPartialConfig only includes provided keys", () => {
    const { schematics } = createSchematics();
    const full = schematics.buildFullConfig({ num: 7 });
    const fullMap = kvConfigToMap(full);
    expect(fullMap.get("num")).toBe(7);
    expect(fullMap.get("name")).toBe("default");

    const partial = schematics.buildPartialConfig({ num: 7 });
    const partialMap = kvConfigToMap(partial);
    expect(partialMap.get("num")).toBe(7);
    expect(partialMap.has("name")).toBe(false);
  });

  it("createBuildPartialConfigInput produces a usable input object", () => {
    const { schematics } = createSchematics();
    const input = schematics.createBuildPartialConfigInput();
    input.num = 3;
    const config = schematics.buildPartialConfig(input);
    expect(kvConfigToMap(config).get("num")).toBe(3);
  });

  it("withTypeParamOverride changes schema without affecting original", () => {
    const { schematics } = createSchematics();
    const updated = schematics.withTypeParamOverride("num", param => ({ ...param, min: 5 }));
    expect(schematics.getSchemaForKey("num").safeParse(1).success).toBe(true);
    expect(updated.getSchemaForKey("num").safeParse(1).success).toBe(false);
    expect(updated.getSchemaForKey("num").safeParse(6).success).toBe(true);
  });

  it("buildFullConfig vs buildPartialConfig: defaults present only in full config", () => {
    const { schematics } = createSchematics();
    const full = schematics.buildFullConfig({ num: 2 });
    const partial = schematics.buildPartialConfig({ num: 2 });
    expect(kvConfigToMap(full).has("name")).toBe(true);
    expect(kvConfigToMap(partial).has("name")).toBe(false);
  });

  it("configBuilder supports extension fields and validates extension prefixes", () => {
    const { schematics } = createSchematics();
    const built = schematics
      .configBuilder()
      .with("num", 1)
      .withExtensionField("ext.custom", { ok: true })
      .build();

    const map = kvConfigToMap(built);
    expect(map.get("num")).toBe(1);
    expect(map.get("ext.custom")).toEqual({ ok: true });

    expect(() => schematics.configBuilder().withExtensionField("nope.field", 1)).toThrow(
      "does not start with any registered extension prefixes",
    );
  });

  it("lenient schema filters unknown keys and invalid values, keeps last duplicate", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([
      kvConfigField("num", 1),
      kvConfigField("num", 2),
      kvConfigField("name", 123),
      kvConfigField("unknown", "x"),
      kvConfigField("ext.custom", { ok: true }),
    ]);

    const parsed = schematics.getLenientZodSchema().parse(config);
    expect(parsed.fields).toEqual([
      { key: "num", value: 2 },
      { key: "ext.custom", value: { ok: true } },
    ]);
  });

  it("getValueType and getValueTypeParam return null for unknown keys", () => {
    const { schematics } = createSchematics();
    expect(schematics.getValueType("num")).toBe("num");
    expect(schematics.getValueType("missing")).toBeNull();
    expect(schematics.getValueTypeParam("missing")).toBeNull();
    expect(schematics.getValueTypeParamByFullKey("num")).toEqual({ min: 0 });
  });

  it("filterConfig, filterStack, and twoWayFilterConfig respect additional filters", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([
      kvConfigField("num", 1),
      kvConfigField("name", "n"),
    ]);
    const filtered = schematics.filterConfig(config, fullKey => fullKey === "num");
    expect(filtered.fields).toEqual([{ key: "num", value: 1 }]);

    const stack = addKVConfigToStack(
      { layers: [] },
      "currentlyEditing",
      config,
    );
    const filteredStack = schematics.filterStack(stack);
    expect(filteredStack.layers[0].config.fields.length).toBe(2);

    const [included, excluded] = schematics.twoWayFilterConfig(config, fullKey => fullKey === "num");
    expect(included.fields).toEqual([{ key: "num", value: 1 }]);
    expect(excluded.fields).toEqual([{ key: "name", value: "n" }]);
  });

  it("filterConfig with and without additionalFilter changes output", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([
      kvConfigField("num", 1),
      kvConfigField("name", "n"),
    ]);
    const withoutFilter = schematics.filterConfig(config);
    const withFilter = schematics.filterConfig(config, fullKey => fullKey === "num");
    expect(withoutFilter.fields.length).toBe(2);
    expect(withFilter.fields).toEqual([{ key: "num", value: 1 }]);
  });

  it("stringifyField uses translation fallback when not provided", () => {
    const { schematics } = createSchematics();
    expect(schematics.stringifyField("name", "hi")).toBe("STR:hi");
    expect(
      schematics.stringifyField("name", "hi", {
        t: key => (key === "test:str" ? "OK" : "NO"),
      }),
    ).toBe("OK:hi");
  });

  it("stringifyField with translator differs from default fallback", () => {
    const { schematics } = createSchematics();
    const defaultOut = schematics.stringifyField("name", "hi");
    const translated = schematics.stringifyField("name", "hi", {
      t: (_key, fallback) => fallback.replace("STR", "X"),
    });
    expect(defaultOut).toBe("STR:hi");
    expect(translated).toBe("X:hi");
  });

  it("tryStringifyFieldWithFullKey returns null for unknown keys", () => {
    const { schematics } = createSchematics();
    expect(schematics.tryStringifyFieldWithFullKey("missing", "x", {})).toBeNull();
  });

  it("iterateFieldsOfConfig and fullKeys only yield schematics fields", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([
      kvConfigField("num", 1),
      kvConfigField("unknown", "x"),
    ]);
    const iterated = Array.from(schematics.iterateFieldsOfConfig(config));
    expect(iterated).toEqual([["num", 1]]);

    const keys = Array.from(schematics.fullKeys());
    expect(keys).toEqual(expect.arrayContaining(["num", "name", "flag", "group.a", "group.b"]));
  });

  it("effectiveCompareConfig uses effectiveEquals result", () => {
    const { schematics } = createSchematics();
    const a = makeKVConfigFromFields([kvConfigField("flag", "a")]);
    const b = makeKVConfigFromFields([kvConfigField("flag", "b")]);
    const diff = schematics.effectiveCompareConfig(a, b);
    expect(diff.inBothButDifferent).toEqual(["flag"]);
  });

  it("fieldEffectiveEqualsWithFullKey compares values by full key", () => {
    const { schematics } = createSchematics();
    expect(schematics.fieldEffectiveEqualsWithFullKey("num", 1, 1)).toBe(true);
    expect(schematics.fieldEffectiveEqualsWithFullKey("num", 1, 2)).toBe(false);
  });

  it("configEffectiveEquals respects effectiveEquals result", () => {
    const { schematics } = createSchematics();
    const a = makeKVConfigFromFields([kvConfigField("flag", "a")]);
    const b = makeKVConfigFromFields([kvConfigField("flag", "b")]);
    expect(schematics.configEffectiveEquals(a, b)).toBe(false);
    expect(schematics.fieldEffectiveEquals("flag", "a", "b")).toBe(false);
  });

  it("serialize/deserialize round-trip retains field behavior", () => {
    const { library, schematics } = createSchematics();
    const serialized = schematics.serialize();
    const deserialized = KVConfigSchematics.deserialize(library, serialized);
    const config = makeKVConfigFromFields([kvConfigField("num", 3)]);
    expect(deserialized.access(config, "num")).toBe(3);
  });

  it("tryDeserialize reports errors and skips invalid fields", () => {
    const { library, schematics } = createSchematics();
    const serialized = schematics.serialize();
    serialized.fields.push({
      shortKey: "bad",
      fullKey: "bad",
      typeKey: "num",
      typeParams: { min: "nope" },
      defaultValue: 0,
    });
    const { schematics: out, errors } = KVConfigSchematics.tryDeserialize(library, serialized);
    expect(errors.length).toBe(1);
    expect(out.hasFullKey("num")).toBe(true);
    expect(out.hasFullKey("bad")).toBe(false);
  });

  it("hasFieldsWithPrefix and filterFullKeys work on full keys", () => {
    const { schematics } = createSchematics();
    expect(schematics.hasFieldsWithPrefix("group.")).toBe(true);
    expect(schematics.filterFullKeys(["num", "missing", "group.a"])).toEqual(["num", "group.a"]);
  });

  it("apply and unApply respect schematics filtering", () => {
    const { schematics } = createSchematics();
    const base = makeKVConfigFromFields([kvConfigField("num", 1), kvConfigField("unknown", 1)]);
    const patch = makeKVConfigFromFields([kvConfigField("num", 2), kvConfigField("unknown", 2)]);
    const applied = schematics.apply(base, patch);
    expect(kvConfigToMap(applied).get("num")).toBe(2);
    expect(kvConfigToMap(applied).get("unknown")).toBe(1);

    const unapplied = schematics.unApply(applied, patch);
    expect(kvConfigToMap(unapplied).get("num")).toBeUndefined();
  });

  it("apply vs raw collapse: schematics filters unknown fields", () => {
    const { schematics } = createSchematics();
    const base = makeKVConfigFromFields([kvConfigField("unknown", 1)]);
    const patch = makeKVConfigFromFields([kvConfigField("unknown", 2)]);
    const applied = schematics.apply(base, patch);
    const raw = collapseKVStackRaw([base, patch]);
    expect(kvConfigToMap(applied).get("unknown")).toBe(1);
    expect(kvConfigToMap(raw).get("unknown")).toBe(2);
  });

  it("lenient schema retains valid fields when no duplicates or unknowns", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([
      kvConfigField("num", 1),
      kvConfigField("name", "ok"),
    ]);
    const parsed = schematics.getLenientZodSchema().parse(config);
    expect(parsed.fields).toEqual([
      { key: "num", value: 1 },
      { key: "name", value: "ok" },
    ]);
  });

  it("buildPartialConfig respects validation", () => {
    const { schematics } = createSchematics();
    expect(() => schematics.buildPartialConfig({ num: -1 })).toThrow();
  });

  it("parseToMapPartial omits missing fields", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([]);
    const map = schematics.parseToMapPartial(config);
    expect(map.has("num")).toBe(false);
  });

  it("configBuilder uses full keys in output", () => {
    const { schematics } = createSchematics();
    const built = schematics.configBuilder().with("group.a", 9).build();
    const map = kvConfigToMap(built);
    expect(map.has("group.a")).toBe(true);
  });

  it("scoped vs non-scoped access yields same value with different key forms", () => {
    const { schematics } = createSchematics();
    const config = makeKVConfigFromFields([kvConfigField("group.a", 6)]);
    const scoped = schematics.scoped("group");
    expect(schematics.access(config, "group.a")).toBe(6);
    expect(scoped.access(config, "a")).toBe(6);
  });

  it("accessByFullKey throws for missing keys", () => {
    const { schematics } = createSchematics();
    expect(() => schematics.accessByFullKey(makeKVConfigFromFields([]), "missing")).toThrow(
      "does not exist",
    );
  });

  it("unApply keeps values that are not effectively equal", () => {
    const { schematics } = createSchematics();
    const target = makeKVConfigFromFields([kvConfigField("flag", "a")]);
    const patch = makeKVConfigFromFields([kvConfigField("flag", "b")]);
    const result = schematics.unApply(target, patch);
    expect(kvConfigToMap(result).get("flag")).toBe("a");
  });

  it("collapseKVStackRaw keeps later layers", () => {
    const config = collapseKVStackRaw([
      makeKVConfigFromFields([kvConfigField("num", 1)]),
      makeKVConfigFromFields([kvConfigField("num", 2)]),
    ]);
    expect(kvConfigToMap(config).get("num")).toBe(2);
  });
});
