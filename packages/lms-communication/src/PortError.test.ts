import { mapPortError } from "./PortError.js";

describe("port error mapping", () => {
  test("preserves errors when no mapper is installed", () => {
    const error = new Error("original");
    expect(mapPortError(undefined, error, "read", "rpc")).toBe(error);
  });

  test("passes endpoint context and keeps the mapper's result", () => {
    const original = new Error("original");
    const mapped = new Error("mapped");
    const mapper = jest.fn(() => mapped);
    expect(mapPortError(mapper, original, "watch", "signal")).toBe(mapped);
    expect(mapper).toHaveBeenCalledWith(original, {
      endpointName: "watch",
      endpointKind: "signal",
    });
  });

  test("falls back to the original error when formatting throws", () => {
    const original = new Error("original");
    const mapper = () => {
      throw new Error("broken mapper");
    };
    expect(mapPortError(mapper, original, "watch", "channel")).toBe(original);
  });
});
