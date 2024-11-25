import { LazySignal } from "./LazySignal.js";
import { type WriteTag } from "./makeSetter.js";

describe("LazySignal", () => {
  it("should not subscribe to the upstream until a subscriber is attached", () => {
    const subscriberMock = jest.fn(() => {
      return () => {};
    });
    const lazySignal = LazySignal.createWithoutInitialValue(subscriberMock);
    expect(subscriberMock).not.toHaveBeenCalled();
    const unsubscribe = lazySignal.subscribe(() => {});
    expect(subscriberMock).toHaveBeenCalled();
    unsubscribe();
  });

  it("should unsubscribe from the upstream when the last subscriber is removed", () => {
    const unsubscribeMock = jest.fn();
    const subscriberMock = jest.fn().mockReturnValue(unsubscribeMock);
    const lazySignal = LazySignal.createWithoutInitialValue(subscriberMock);
    const unsubscribe = lazySignal.subscribe(() => {});
    expect(subscriberMock).toHaveBeenCalled();
    unsubscribe();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it("should return NOT_AVAILABLE until the first value is emitted from the upstream", () => {
    const lazySignal = LazySignal.createWithoutInitialValue(() => {
      return () => {};
    });
    expect(lazySignal.get()).toBe(LazySignal.NOT_AVAILABLE);
  });

  it("should return the value emitted from the upstream once it is emitted", () => {
    const data = "test";
    let callback: (data: string) => void = () => {};
    const subscriberMock = jest.fn().mockImplementation(cb => {
      callback = cb;
      return () => {};
    });
    const lazySignal = LazySignal.createWithoutInitialValue(subscriberMock);
    lazySignal.subscribe(() => {});
    callback(data);
    expect(lazySignal.get()).toBe(data);
  });

  it("should return stale data when no subscriber is attached", () => {
    const lazySignal = LazySignal.createWithoutInitialValue(() => {
      return () => {};
    });
    expect(lazySignal.isStale()).toBe(true);
  });

  it("should return stale data when a subscriber is attached but the upstream has not yet emitted a value", () => {
    const lazySignal = LazySignal.createWithoutInitialValue(() => {
      return () => {};
    });
    lazySignal.subscribe(() => {});
    expect(lazySignal.isStale()).toBe(true);
  });

  it("should return not stale data when a subscriber is attached and the upstream has emitted a value", () => {
    let callback: (data: string) => void = () => {};
    const subscriberMock = jest.fn().mockImplementation(cb => {
      callback = cb;
      return () => {};
    });
    const lazySignal = LazySignal.createWithoutInitialValue(subscriberMock);
    lazySignal.subscribe(() => {});
    callback("test");
    expect(lazySignal.isStale()).toBe(false);
  });

  it("should wait for the next value from the upstream and return it when the value is stale and pull is called", async () => {
    const data = "test";
    let callback: (data: string) => void = () => {};
    const subscriberMock = jest.fn().mockImplementation(cb => {
      callback = cb;
      return () => {};
    });
    const lazySignal = LazySignal.createWithoutInitialValue(subscriberMock);
    lazySignal.subscribeFull(() => {});
    const promise = lazySignal.pull();
    callback(data);
    await expect(promise).resolves.toBe(data);
  });

  it("should preserve tags from the upstream", () => {
    const data = "test";
    let callback: (data: string, tags: Array<WriteTag>) => void = () => {};
    const subscriberMock = jest.fn().mockImplementation(cb => {
      callback = cb;
      return () => {};
    });
    const lazySignal = LazySignal.createWithoutInitialValue(subscriberMock);
    const listener = jest.fn();
    lazySignal.subscribeFull(listener);
    callback(data, ["tag1", "tag2"]);
    expect(lazySignal.get()).toBe(data);
    expect(listener).toHaveBeenCalledWith(
      data,
      [
        {
          op: "replace",
          path: [],
          value: data,
        },
      ],
      ["tag1", "tag2"],
    );
  });
});
