import { LazySignal } from "./LazySignal.js";
import { type WriteTag } from "./makeSetter.js";
import { Signal } from "./Signal.js";

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

  it("should emit error on errorSignal when upstream errors", async () => {
    let errorListener: any /* ((error: unknown) => void) | null */ = null;
    const lazySignal = LazySignal.createWithoutInitialValue((_, onError) => {
      errorListener = onError;
      return () => {};
    });
    lazySignal.subscribe(() => {});
    expect(errorListener).not.toBeNull();
    const upstreamError = new Error("upstream failed");
    errorListener?.(upstreamError);
    // Wait for the error to propagate
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(lazySignal.errorSignal.get()).toBeInstanceOf(Error);
    expect((lazySignal.errorSignal.get() as Error).message).toBe("upstream failed");
    // Subsequent errors should be ignored (error already set)
    errorListener?.(new Error("ignored"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect((lazySignal.errorSignal.get() as Error).message).toBe("upstream failed");
  });

  it("should not resubscribe to upstream after an error", async () => {
    let errorListener: any /* ((error: unknown) => void) | null */ = null;
    const unsubscribeMock = jest.fn();
    const subscribeUpstream = jest.fn().mockImplementation((_, onError) => {
      errorListener = onError;
      return unsubscribeMock;
    });
    const lazySignal = LazySignal.createWithoutInitialValue(subscribeUpstream);
    const unsubscribe = lazySignal.subscribe(() => {});
    expect(subscribeUpstream).toHaveBeenCalledTimes(1);
    const upstreamError = new Error("boom");
    expect(errorListener).not.toBeNull();
    errorListener?.(upstreamError);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(lazySignal.errorSignal.get()).toBeInstanceOf(Error);
    expect(unsubscribeMock).not.toHaveBeenCalled();
    const secondUnsubscribe = lazySignal.subscribe(() => {});
    expect(subscribeUpstream).toHaveBeenCalledTimes(1);
    expect(lazySignal.isStale()).toBe(true);
    unsubscribe();
    secondUnsubscribe();
  });

  describe("hasError", () => {
    it("should return false initially", () => {
      const lazySignal = LazySignal.createWithoutInitialValue(() => () => {});
      expect(lazySignal.hasError()).toBe(false);
    });

    it("should return true after an error occurs", () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const lazySignal = LazySignal.createWithoutInitialValue((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      lazySignal.subscribe(() => {});
      errorListener?.(new Error("test error"));
      expect(lazySignal.hasError()).toBe(true);
    });
  });

  describe("recoverFromError", () => {
    it("should return false when not in error state", () => {
      const lazySignal = LazySignal.createWithoutInitialValue(() => () => {});
      expect(lazySignal.recoverFromError()).toBe(false);
    });

    it("should return true when in error state", () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const lazySignal = LazySignal.createWithoutInitialValue((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      lazySignal.subscribe(() => {});
      errorListener?.(new Error("test error"));
      expect(lazySignal.recoverFromError()).toBe(true);
    });

    it("should clear error state after recovery", () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const lazySignal = LazySignal.createWithoutInitialValue((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      lazySignal.subscribe(() => {});
      errorListener?.(new Error("test error"));
      expect(lazySignal.hasError()).toBe(true);
      lazySignal.recoverFromError();
      expect(lazySignal.hasError()).toBe(false);
    });

    it("should mark data as stale after recovery", () => {
      let setDownstream: any /* ((data: string) => void) | null */ = null;
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const lazySignal = LazySignal.createWithoutInitialValue<string>((cb, onError) => {
        setDownstream = cb;
        errorListener = onError;
        return () => {};
      });
      lazySignal.subscribe(() => {});
      setDownstream?.("initial");
      expect(lazySignal.isStale()).toBe(false);
      errorListener?.(new Error("test error"));
      expect(lazySignal.isStale()).toBe(true);
      lazySignal.recoverFromError();
      expect(lazySignal.isStale()).toBe(true);
    });

    it("should resubscribe to upstream when there are active subscribers", () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const subscribeUpstream = jest.fn().mockImplementation((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      const lazySignal = LazySignal.createWithoutInitialValue(subscribeUpstream);
      lazySignal.subscribe(() => {});
      expect(subscribeUpstream).toHaveBeenCalledTimes(1);
      errorListener?.(new Error("test error"));
      expect(lazySignal.hasError()).toBe(true);
      lazySignal.recoverFromError();
      expect(subscribeUpstream).toHaveBeenCalledTimes(2);
    });

    it("should not resubscribe when there are no active subscribers", () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const subscribeUpstream = jest.fn().mockImplementation((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      const lazySignal = LazySignal.createWithoutInitialValue(subscribeUpstream);
      const unsubscribe = lazySignal.subscribe(() => {});
      expect(subscribeUpstream).toHaveBeenCalledTimes(1);
      errorListener?.(new Error("test error"));
      unsubscribe();
      lazySignal.recoverFromError();
      // Should not resubscribe since there are no subscribers
      expect(subscribeUpstream).toHaveBeenCalledTimes(1);
    });

    it("should clear error on errorSignal and emit new errors after recovery", async () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const subscribeUpstream = jest.fn().mockImplementation((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      const lazySignal = LazySignal.createWithoutInitialValue(subscribeUpstream);
      lazySignal.subscribe(() => {});

      // First error
      const firstError = new Error("first error");
      errorListener?.(firstError);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(lazySignal.errorSignal.get()).toBeInstanceOf(Error);
      expect((lazySignal.errorSignal.get() as Error).message).toBe("first error");

      // Recover
      lazySignal.recoverFromError();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(lazySignal.errorSignal.get()).toBe(null);

      // Second error - should be caught by error signal
      const secondError = new Error("second error");
      errorListener?.(secondError);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(lazySignal.errorSignal.get()).toBeInstanceOf(Error);
      expect((lazySignal.errorSignal.get() as Error).message).toBe("second error");
    });

    it("should allow new subscriptions to trigger upstream subscription after recovery", () => {
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const subscribeUpstream = jest.fn().mockImplementation((_, onError) => {
        errorListener = onError;
        return () => {};
      });
      const lazySignal = LazySignal.createWithoutInitialValue(subscribeUpstream);
      const unsubscribe1 = lazySignal.subscribe(() => {});
      expect(subscribeUpstream).toHaveBeenCalledTimes(1);

      // Error occurs and subscriber leaves
      errorListener?.(new Error("test error"));
      unsubscribe1();

      // Recover (no subscribers, so no resubscription yet)
      lazySignal.recoverFromError();
      expect(subscribeUpstream).toHaveBeenCalledTimes(1);

      // New subscription should now trigger upstream subscription
      const unsubscribe2 = lazySignal.subscribe(() => {});
      expect(subscribeUpstream).toHaveBeenCalledTimes(2);
      unsubscribe2();
    });

    it("should receive new data after recovery and resubscription", () => {
      let setDownstream: any /* ((data: string) => void) | null */ = null;
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const subscribeUpstream = jest.fn().mockImplementation((cb, onError) => {
        setDownstream = cb;
        errorListener = onError;
        return () => {};
      });
      const lazySignal = LazySignal.createWithoutInitialValue<string>(subscribeUpstream);
      const listener = jest.fn();
      lazySignal.subscribe(listener);

      // Initial data
      setDownstream?.("initial");
      expect(lazySignal.get()).toBe("initial");
      expect(listener).toHaveBeenCalledWith("initial");

      // Error occurs
      errorListener?.(new Error("test error"));
      expect(lazySignal.hasError()).toBe(true);

      // Recover - should resubscribe since we have active subscriber
      lazySignal.recoverFromError();
      expect(subscribeUpstream).toHaveBeenCalledTimes(2);

      // New data after recovery
      setDownstream?.("recovered");
      expect(lazySignal.get()).toBe("recovered");
      expect(listener).toHaveBeenCalledWith("recovered");
      expect(lazySignal.isStale()).toBe(false);
    });

    it("should resolve pending pull() after recovery when new data arrives", async () => {
      let setDownstream: any /* ((data: string) => void) | null */ = null;
      let errorListener: any /* ((error: unknown) => void) | null */ = null;
      const subscribeUpstream = jest.fn().mockImplementation((cb, onError) => {
        setDownstream = cb;
        errorListener = onError;
        return () => {};
      });
      const lazySignal = LazySignal.createWithoutInitialValue<string>(subscribeUpstream);
      lazySignal.subscribeFull(() => {});

      // Initial data
      setDownstream?.("initial");
      expect(lazySignal.get()).toBe("initial");

      // Error occurs
      errorListener?.(new Error("test error"));
      expect(lazySignal.hasError()).toBe(true);

      // Call pull() while in error state - should hang until recovery
      const pullPromise = lazySignal.pull();

      // Verify pull hasn't resolved yet
      let resolved = false;
      pullPromise.then(() => {
        resolved = true;
      });
      await Promise.resolve(); // Let any pending microtasks run
      expect(resolved).toBe(false);

      // Recover from error
      lazySignal.recoverFromError();

      // Still shouldn't resolve until new data arrives
      await Promise.resolve();
      expect(resolved).toBe(false);

      // New data arrives after recovery
      setDownstream?.("after-recovery");

      // Now pull should resolve with the new value
      await expect(pullPromise).resolves.toBe("after-recovery");
    });
  });
});

describe("blockingAsyncDeriveFromWithThrottling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Helper to create a controllable async deriver.
   * Returns the deriver function and a way to control/inspect its invocations.
   */
  function createControllableDeriver<T>() {
    const invocations: Array<{
      args: Array<unknown>;
      resolve: (value: T) => void;
      reject: (error: unknown) => void;
    }> = [];

    const deriver = (...args: Array<unknown>): Promise<T> => {
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      invocations.push({ args, resolve, reject });
      return promise;
    };

    return { deriver, invocations };
  }

  it("should run derives serially, not concurrently", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(0, [source], deriver);
    derived.subscribe(() => {});

    // Initial derive starts immediately
    await Promise.resolve();
    expect(invocations).toHaveLength(1);
    expect(invocations[0].args).toEqual(["A"]);

    // Emit B while A is still deriving
    setSource("B");
    await Promise.resolve();

    // B should NOT start yet (A is still running)
    expect(invocations).toHaveLength(1);

    // Complete A's derive
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // Now B's derive should start
    expect(invocations).toHaveLength(2);
    expect(invocations[1].args).toEqual(["B"]);
  });

  it("should coalesce queued events, keeping only the latest", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(0, [source], deriver);
    derived.subscribe(() => {});

    // Initial derive starts
    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // Rapidly emit B, C, D while A is deriving
    setSource("B");
    setSource("C");
    setSource("D");
    await Promise.resolve();

    // Still only A running
    expect(invocations).toHaveLength(1);

    // Complete A
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // Only D should run (B and C were coalesced away)
    expect(invocations).toHaveLength(2);
    expect(invocations[1].args).toEqual(["D"]);
  });

  it("should insert throttle delay after derive completion", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(100, [source], deriver);
    derived.subscribe(() => {});

    // T=0: A starts immediately
    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // T=20: A completes
    jest.advanceTimersByTime(20);
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // T=50: Emit B
    jest.advanceTimersByTime(30);
    setSource("B");
    await Promise.resolve();

    // B should NOT start yet (throttle not elapsed)
    expect(invocations).toHaveLength(1);

    // T=119: Still waiting
    jest.advanceTimersByTime(69);
    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // T=120: Throttle elapsed (100ms after A completed at T=20)
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(invocations).toHaveLength(2);
    expect(invocations[1].args).toEqual(["B"]);
  });

  it("should not add spurious delay when nothing is queued", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(100, [source], deriver);
    derived.subscribe(() => {});

    // A starts and completes
    await Promise.resolve();
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // Wait well past the throttle time
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    // Now emit B - should start immediately (no extra delay)
    setSource("B");
    await Promise.resolve();
    expect(invocations).toHaveLength(2);
    expect(invocations[1].args).toEqual(["B"]);
  });

  it("should work with throttleMs=0 as pure blocking (no delay)", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(0, [source], deriver);
    derived.subscribe(() => {});

    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // Emit B while A is running
    setSource("B");
    await Promise.resolve();

    // Complete A
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // B should start immediately (no setTimeout needed)
    expect(invocations).toHaveLength(2);
  });

  it("should cancel pending events and timers on unsubscribe", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(100, [source], deriver);
    const unsubscribe = derived.subscribe(() => {});

    // A starts
    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // Queue B
    setSource("B");
    await Promise.resolve();

    // Unsubscribe before A completes
    unsubscribe();

    // Complete A
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // Advance timers past throttle
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    // B should never have started
    expect(invocations).toHaveLength(1);
  });
});
