import { kvValueTypesLibrary } from "./valueTypes.js";

describe("kvValueTypesLibrary", () => {
  it("numeric enforces min/max/int and rejects int+precision", () => {
    const schema = kvValueTypesLibrary.getSchema("numeric", { min: 0, max: 10, int: true });
    expect(schema.safeParse(5).success).toBe(true);
    expect(schema.safeParse(5.5).success).toBe(false);
    expect(schema.safeParse(-1).success).toBe(false);
    expect(() =>
      kvValueTypesLibrary.getSchema("numeric", { int: true, precision: 2 }),
    ).toThrow("Cannot specify both int and precision.");
  });

  it("string respects isProtected in stringify", () => {
    const out = kvValueTypesLibrary.stringify(
      "string",
      { isProtected: true },
      { t: (_key, fallback) => fallback },
      "secret",
    );
    expect(out).toBe("********");
  });

  it("checkboxNumeric ignores value when unchecked", () => {
    const eq = kvValueTypesLibrary.effectiveEquals(
      "checkboxNumeric",
      {},
      { checked: false, value: 1 },
      { checked: false, value: 2 },
    );
    expect(eq).toBe(true);

    const out = kvValueTypesLibrary.stringify(
      "checkboxNumeric",
      {},
      { t: (_key, fallback) => fallback },
      { checked: false, value: 1 },
    );
    expect(out).toBe("OFF");
  });

  it("llamaAccelerationOffloadRatio treats max and 1 as equal", () => {
    const eq = kvValueTypesLibrary.effectiveEquals(
      "llamaAccelerationOffloadRatio",
      {},
      "max",
      1,
    );
    expect(eq).toBe(true);

    const out = kvValueTypesLibrary.stringify(
      "llamaAccelerationOffloadRatio",
      {},
      { t: (_key, fallback) => fallback },
      "off",
    );
    expect(out).toBe("OFF");
  });

  it("checkboxNumeric rejects int+precision", () => {
    expect(() =>
      kvValueTypesLibrary.getSchema("checkboxNumeric", { int: true, precision: 2 }),
    ).toThrow("Cannot specify both int and precision.");
  });
});
