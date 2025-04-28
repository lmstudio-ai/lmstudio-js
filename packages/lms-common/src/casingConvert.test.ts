import { kebabToCamelCase } from "./casingConvert";

describe("kebabToCamelCase", () => {
  it("should convert a simple kebab-case string to camelCase", () => {
    expect(kebabToCamelCase("hello-world")).toBe("helloWorld");
  });

  it("should handle single-word strings without hyphens", () => {
    expect(kebabToCamelCase("hello")).toBe("hello");
  });

  it("should convert strings with multiple hyphens to camelCase", () => {
    expect(kebabToCamelCase("this-is-a-test")).toBe("thisIsATest");
  });

  it("should return an empty string when input is empty", () => {
    expect(kebabToCamelCase("")).toBe("");
  });

  it("should handle strings with numbers and special characters", () => {
    expect(kebabToCamelCase("hello-world-123")).toBe("helloWorld123");
    expect(kebabToCamelCase("foo-bar-baz!")).toBe("fooBarBaz!");
  });
});
