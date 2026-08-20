import { modelDomainTypeSchema } from "./ModelDomainType.js";

describe("ModelDomainType", () => {
  it("accepts drafter model domains", () => {
    expect(modelDomainTypeSchema.parse("drafter")).toBe("drafter");
  });
});
