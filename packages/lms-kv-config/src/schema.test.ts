import { kvConfigField, KVConfigSchematicsBuilder, makeKVConfigFromFields } from "./KVConfig.js";
import { globalConfigSchematics } from "./schema.js";
import { kvValueTypesLibrary } from "./valueTypes.js";

describe("KVConfig", () => {
  describe("union", () => {
    it("should work with root level schematics", () => {
      const schematics1 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("a", "numeric", {}, 0)
        .build();
      const schematics2 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("b", "numeric", {}, 0)
        .build();
      const union = schematics1.union(schematics2);
      const kvConfig = makeKVConfigFromFields([kvConfigField("a", 1), kvConfigField("b", 2)]);
      const parsed = union.parse(kvConfig);
      expect(parsed.get("a")).toBe(1);
      expect(parsed.get("b")).toBe(2);
    });
    it("should work with nested level schematics", () => {
      const schematics1 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .scope("nested", builder => builder.field("a", "numeric", {}, 0))
        .build();
      const schematics2 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("b", "numeric", {}, 0)
        .build();
      const union = schematics1.union(schematics2);
      const kvConfig = makeKVConfigFromFields([
        kvConfigField("nested.a", 1),
        kvConfigField("b", 2),
      ]);
      const parsed = union.parse(kvConfig);
      expect(parsed.get("nested.a")).toBe(1);
      expect(parsed.get("b")).toBe(2);
    });
    it("should work with scoped schematics", () => {
      const schematics1 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .scope("nested", builder => builder.field("a", "numeric", {}, 0))
        .build();
      const schematics2 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("b", "numeric", {}, 0)
        .build();
      const union = schematics1.scoped("nested").union(schematics2);
      const kvConfig = makeKVConfigFromFields([
        kvConfigField("nested.a", 1),
        kvConfigField("b", 2),
      ]);
      const parsed = union.parse(kvConfig);
      expect(parsed.get("a")).toBe(1);
      expect(parsed.get("b")).toBe(2);
    });
  });
});

describe("globalConfigSchematics", () => {
  describe("effectiveEquals", () => {
    it("should work with temperature", () => {
      expect(globalConfigSchematics.fieldEffectiveEquals("llm.prediction.temperature", 0, 0)).toBe(
        true,
      );
      expect(globalConfigSchematics.fieldEffectiveEquals("llm.prediction.temperature", 0, 1)).toBe(
        false,
      );
    });
    it("should work with repeat penalty", () => {
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: true, value: 0 },
          { checked: true, value: 0 },
        ),
      ).toBe(true);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: true, value: 0 },
          { checked: true, value: 1 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: true, value: 0 },
          { checked: false, value: 0 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: false, value: 0 },
          { checked: false, value: 1 },
        ),
      ).toBe(true);
    });
    it("should work with presence penalty", () => {
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: true, value: 0 },
          { checked: true, value: 0 },
        ),
      ).toBe(true);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: true, value: 0 },
          { checked: true, value: 1 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: true, value: 0 },
          { checked: false, value: 0 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: false, value: 0 },
          { checked: false, value: 1 },
        ),
      ).toBe(true);
    });
  });
  describe("stringify", () => {
    it("should work with temperature", () => {
      expect(globalConfigSchematics.stringifyField("llm.prediction.temperature", 0)).toBe("0.00");
      expect(globalConfigSchematics.stringifyField("llm.prediction.temperature", 0.5)).toBe("0.50");
    });
    it("should work with repeat penalty", () => {
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.repeatPenalty", {
          checked: true,
          value: 0,
        }),
      ).toBe("0.00");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.repeatPenalty", {
          checked: true,
          value: 0.5,
        }),
      ).toBe("0.50");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.repeatPenalty", {
          checked: false,
          value: 0.5,
        }),
      ).toBe("OFF");

      const translateFn = jest.fn(() => "TEST");
      expect(
        globalConfigSchematics.stringifyField(
          "llm.prediction.repeatPenalty",
          {
            checked: false,
            value: 0.5,
          },
          {
            t: translateFn,
          },
        ),
      ).toBe("TEST");
      expect(translateFn).toHaveBeenCalledTimes(1);
      expect(translateFn).toHaveBeenCalledWith("config:customInputs.checkboxNumeric.off", "OFF");
    });
    it("should work with presence penalty", () => {
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.llama.presencePenalty", {
          checked: true,
          value: 0,
        }),
      ).toBe("0.00");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.llama.presencePenalty", {
          checked: true,
          value: 0.5,
        }),
      ).toBe("0.50");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.llama.presencePenalty", {
          checked: false,
          value: 0.5,
        }),
      ).toBe("OFF");

      const translateFn = jest.fn(() => "TEST");
      expect(
        globalConfigSchematics.stringifyField(
          "llm.prediction.llama.presencePenalty",
          {
            checked: false,
            value: 0.5,
          },
          {
            t: translateFn,
          },
        ),
      ).toBe("TEST");
      expect(translateFn).toHaveBeenCalledTimes(1);
      expect(translateFn).toHaveBeenCalledWith("config:customInputs.checkboxNumeric.off", "OFF");
    });
  });
});
