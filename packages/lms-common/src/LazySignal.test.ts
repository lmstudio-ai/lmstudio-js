import { LazySignal } from "./LazySignal.js";
import { type Setter, type WriteTag } from "./makeSetter.js";
import { OWLSignal } from "./OWLSignal.js";
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

  it("should allow waiting for fresh data to be cancelled", () => {
    let emitUpstream: (value: string) => void = () => {};
    const unsubscribeUpstream = jest.fn();
    const lazySignal = LazySignal.create("cached", setDownstream => {
      emitUpstream = setDownstream;
      return unsubscribeUpstream;
    });
    const callback = jest.fn();

    const cancel = lazySignal.runOnNextFreshData(callback);
    cancel();
    emitUpstream("fresh");

    expect(callback).not.toHaveBeenCalled();
    expect(unsubscribeUpstream).toHaveBeenCalledTimes(1);
  });

  it("should clean up after fresh data is emitted synchronously during subscription", () => {
    const unsubscribeUpstream = jest.fn();
    const lazySignal = LazySignal.create("cached", setDownstream => {
      setDownstream("fresh");
      return unsubscribeUpstream;
    });
    const callback = jest.fn();

    lazySignal.runOnNextFreshData(callback);

    expect(callback).toHaveBeenCalledWith("fresh");
    expect(unsubscribeUpstream).toHaveBeenCalledTimes(1);
    expect(lazySignal.isStale()).toBe(true);
  });

  it("should not let a derived signal treat a stale source value as fresh", async () => {
    let emitUpstream: (value: string) => void = () => {};
    const sourceSignal = LazySignal.create("cached", setDownstream => {
      emitUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sourceSignal.isStale()).toBe(true);
    expect(pullResolved).toBe(false);

    emitUpstream("fresh");
    await expect(pullPromise).resolves.toBe("derived:fresh");
  });

  it("should pull fresh data through a nested derive chain", async () => {
    let emitUpstream: (value: string) => void = () => {};
    const sourceSignal = LazySignal.createWithoutInitialValue<string>(setDownstream => {
      emitUpstream = setDownstream;
      return () => {};
    });
    const firstDerivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `first:${sourceValue}`,
    );
    const secondDerivedSignal = LazySignal.deriveFrom(
      [firstDerivedSignal],
      firstDerivedValue => `second:${firstDerivedValue}`,
    );

    const initialPullPromise = secondDerivedSignal.pull();
    emitUpstream("initial");
    await expect(initialPullPromise).resolves.toBe("second:first:initial");

    const refreshedPullPromise = secondDerivedSignal.pull();
    emitUpstream("updated");

    await expect(refreshedPullPromise).resolves.toBe("second:first:updated");
  });

  it("should derive once from the final value of a reentrant OWLSignal refresh", () => {
    const initialValue = { count: 0 };
    let emitUpstream!: Setter<typeof initialValue>;
    const [sourceSignal, setSourceSignal] = OWLSignal.create(
      initialValue,
      setDownstream => {
        emitUpstream = setDownstream;
        return () => {};
      },
      () => true,
    );
    const unsubscribeReentrantUpdate = sourceSignal.subscribe(value => {
      if (value.count === 1) {
        emitUpstream({ count: 10 });
      }
    });
    const derivedSignal = LazySignal.deriveFrom([sourceSignal], value => value.count);
    const listener = jest.fn();
    const unsubscribe = derivedSignal.subscribe(listener);

    setSourceSignal.withProducer(draft => {
      draft.count += 1;
    });

    expect(sourceSignal.isStale()).toBe(false);
    expect(sourceSignal.get()).toEqual({ count: 11 });
    expect(derivedSignal.isStale()).toBe(false);
    expect(derivedSignal.get()).toBe(11);
    expect(listener.mock.calls).toEqual([[11]]);

    unsubscribe();
    unsubscribeReentrantUpdate();
  });

  it("should wait for a same-value refresh from a stale source", async () => {
    let emitUpstream: (value: string) => void = () => {};
    const sourceSignal = LazySignal.create("unchanged", setDownstream => {
      emitUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pullResolved).toBe(false);

    emitUpstream("unchanged");
    await expect(pullPromise).resolves.toBe("derived:unchanged");
  });

  it("should wait until every source has fresh data", async () => {
    const eagerSourceSignal = Signal.createReadonly("eager");
    let emitLazyUpstream: (value: string) => void = () => {};
    const lazySourceSignal = LazySignal.create("cached", setDownstream => {
      emitLazyUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [eagerSourceSignal, lazySourceSignal],
      (eagerValue, lazyValue) => `${eagerValue}:${lazyValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pullResolved).toBe(false);

    emitLazyUpstream("fresh");
    await expect(pullPromise).resolves.toBe("eager:fresh");
  });

  it("should wait for multiple stale sources that refresh out of order", async () => {
    let emitFirstUpstream: (value: string) => void = () => {};
    const firstSourceSignal = LazySignal.create("first-cached", setDownstream => {
      emitFirstUpstream = setDownstream;
      return () => {};
    });
    let emitSecondUpstream: (value: string) => void = () => {};
    const secondSourceSignal = LazySignal.create("second-cached", setDownstream => {
      emitSecondUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [firstSourceSignal, secondSourceSignal],
      (firstValue, secondValue) => `${firstValue}:${secondValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });

    emitSecondUpstream("second-fresh");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(pullResolved).toBe(false);

    emitFirstUpstream("first-fresh");
    await expect(pullPromise).resolves.toBe("first-fresh:second-fresh");
  });

  it("should continue waiting when a stale source errors before its first refresh and recovers", async () => {
    let emitFirstUpstream: (value: string) => void = () => {};
    let failFirstUpstream: (error: Error) => void = () => {};
    const firstSourceSignal = LazySignal.create(
      "first-cached",
      (setDownstream, errorListener) => {
        emitFirstUpstream = setDownstream;
        failFirstUpstream = errorListener;
        return () => {};
      },
    );
    let emitSecondUpstream: (value: string) => void = () => {};
    const secondSourceSignal = LazySignal.create("second-cached", setDownstream => {
      emitSecondUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [firstSourceSignal, secondSourceSignal],
      (firstValue, secondValue) => `${firstValue}:${secondValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });

    failFirstUpstream(new Error("upstream failed"));
    expect(firstSourceSignal.recoverFromError()).toBe(true);
    emitSecondUpstream("second-fresh");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(pullResolved).toBe(false);

    emitFirstUpstream("first-recovered");
    await expect(pullPromise).resolves.toBe("first-recovered:second-fresh");
  });

  it("should wait for a recovered source to refresh again if it errors while other sources are pending", async () => {
    let emitFirstUpstream: (value: string) => void = () => {};
    let failFirstUpstream: (error: Error) => void = () => {};
    const firstSourceSignal = LazySignal.create(
      "first-cached",
      (setDownstream, errorListener) => {
        emitFirstUpstream = setDownstream;
        failFirstUpstream = errorListener;
        return () => {};
      },
    );
    let emitSecondUpstream: (value: string) => void = () => {};
    const secondSourceSignal = LazySignal.create("second-cached", setDownstream => {
      emitSecondUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [firstSourceSignal, secondSourceSignal],
      (firstValue, secondValue) => `${firstValue}:${secondValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });

    emitFirstUpstream("first-fresh");
    failFirstUpstream(new Error("upstream failed"));
    expect(firstSourceSignal.recoverFromError()).toBe(true);
    emitSecondUpstream("second-fresh");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(firstSourceSignal.isStale()).toBe(true);
    expect(pullResolved).toBe(false);

    emitFirstUpstream("first-recovered");
    await expect(pullPromise).resolves.toBe("first-recovered:second-fresh");
  });

  it("should not derive from a stale source after an earlier successful derivation", () => {
    let emitFirstUpstream: (value: string) => void = () => {};
    let failFirstUpstream: (error: Error) => void = () => {};
    const firstSourceSignal = LazySignal.create(
      "first-cached",
      (setDownstream, errorListener) => {
        emitFirstUpstream = setDownstream;
        failFirstUpstream = errorListener;
        return () => {};
      },
    );
    let emitSecondUpstream: (value: string) => void = () => {};
    const secondSourceSignal = LazySignal.create("second-cached", setDownstream => {
      emitSecondUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [firstSourceSignal, secondSourceSignal],
      (firstValue, secondValue) => `${firstValue}:${secondValue}`,
    );
    const listener = jest.fn();
    const unsubscribe = derivedSignal.subscribe(listener);

    emitFirstUpstream("first-fresh");
    emitSecondUpstream("second-fresh");
    expect(derivedSignal.get()).toBe("first-fresh:second-fresh");
    listener.mockClear();

    failFirstUpstream(new Error("upstream failed"));
    expect(firstSourceSignal.recoverFromError()).toBe(true);
    emitSecondUpstream("second-new");

    expect(firstSourceSignal.isStale()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(derivedSignal.get()).toBe("first-fresh:second-fresh");

    emitFirstUpstream("first-recovered");
    expect(listener).toHaveBeenCalledWith("first-recovered:second-new");
    expect(derivedSignal.get()).toBe("first-recovered:second-new");
    unsubscribe();
  });

  it("should become stale and make pull wait when a source errors after deriving", async () => {
    let emitUpstream: (value: string) => void = () => {};
    let failUpstream: (error: Error) => void = () => {};
    const sourceSignal = LazySignal.create("cached", (setDownstream, errorListener) => {
      emitUpstream = setDownstream;
      failUpstream = errorListener;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );
    const unsubscribe = derivedSignal.subscribe(() => {});

    emitUpstream("fresh");
    expect(derivedSignal.isStale()).toBe(false);

    failUpstream(new Error("upstream failed"));
    expect(derivedSignal.isStale()).toBe(true);

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });
    expect(sourceSignal.recoverFromError()).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(pullResolved).toBe(false);

    emitUpstream("fresh");
    await expect(pullPromise).resolves.toBe("derived:fresh");
    expect(derivedSignal.isStale()).toBe(false);
    unsubscribe();
  });

  it("should propagate source staleness through a nested derive chain", async () => {
    let emitUpstream: (value: string) => void = () => {};
    let failUpstream: (error: Error) => void = () => {};
    const sourceSignal = LazySignal.create("cached", (setDownstream, errorListener) => {
      emitUpstream = setDownstream;
      failUpstream = errorListener;
      return () => {};
    });
    const firstDerivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `first:${sourceValue}`,
    );
    const secondDerivedSignal = LazySignal.deriveFrom(
      [firstDerivedSignal],
      sourceValue => `second:${sourceValue}`,
    );
    const unsubscribe = secondDerivedSignal.subscribe(() => {});

    emitUpstream("fresh");
    expect(secondDerivedSignal.isStale()).toBe(false);

    failUpstream(new Error("upstream failed"));
    expect(firstDerivedSignal.isStale()).toBe(true);
    expect(secondDerivedSignal.isStale()).toBe(true);

    const pullPromise = secondDerivedSignal.pull();
    expect(sourceSignal.recoverFromError()).toBe(true);
    emitUpstream("fresh");

    await expect(pullPromise).resolves.toBe("second:first:fresh");
    expect(secondDerivedSignal.isStale()).toBe(false);
    unsubscribe();
  });

  it("should capture a synchronous upstream emission during subscription", async () => {
    const sourceSignal = LazySignal.create("cached", setDownstream => {
      setDownstream("synchronous");
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );

    await expect(derivedSignal.pull()).resolves.toBe("derived:synchronous");
  });

  it("should capture the last of several synchronous subscription emissions", async () => {
    const sourceSignal = LazySignal.create("cached", setDownstream => {
      setDownstream("first");
      setDownstream("second");
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );

    await expect(derivedSignal.pull()).resolves.toBe("derived:second");
  });

  it("should release stale source subscriptions when the derived signal is unsubscribed", () => {
    let activeUpstreamSubscriptions = 0;
    const sourceSignal = LazySignal.create("cached", () => {
      activeUpstreamSubscriptions++;
      return () => {
        activeUpstreamSubscriptions--;
      };
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );

    const unsubscribe = derivedSignal.subscribe(() => {});
    expect(activeUpstreamSubscriptions).toBe(1);

    unsubscribe();
    expect(activeUpstreamSubscriptions).toBe(0);
  });

  it("should propagate eager source updates synchronously", () => {
    const [sourceSignal, setSourceSignal] = Signal.create("initial");
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );
    const listener = jest.fn();
    const unsubscribe = derivedSignal.subscribe(listener);

    setSourceSignal("updated");

    expect(listener).toHaveBeenCalledWith("derived:updated");
    expect(derivedSignal.get()).toBe("derived:updated");
    unsubscribe();
  });

  it("should wait for an unavailable source to become available", async () => {
    let emitUpstream: (value: string) => void = () => {};
    const sourceSignal = LazySignal.createWithoutInitialValue<string>(setDownstream => {
      emitUpstream = setDownstream;
      return () => {};
    });
    const derivedSignal = LazySignal.deriveFrom(
      [sourceSignal],
      sourceValue => `derived:${sourceValue}`,
    );

    const pullPromise = derivedSignal.pull();
    let pullResolved = false;
    void pullPromise.then(() => {
      pullResolved = true;
    });
    await Promise.resolve();
    expect(pullResolved).toBe(false);

    emitUpstream("available");
    await expect(pullPromise).resolves.toBe("derived:available");
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

describe("asyncDeriveFrom", () => {
  it("should ignore work started before a source became stale", async () => {
    let emitUpstream: (value: string) => void = () => {};
    let failUpstream: (error: Error) => void = () => {};
    const sourceSignal = LazySignal.create("cached", (setDownstream, errorListener) => {
      emitUpstream = setDownstream;
      failUpstream = errorListener;
      return () => {};
    });
    const resolvers = new Array<(value: string) => void>();
    const deriver = jest.fn(
      (sourceValue: string) =>
        new Promise<string>(resolve => {
          resolvers.push(result => resolve(`${sourceValue}:${result}`));
        }),
    );
    const derivedSignal = LazySignal.asyncDeriveFrom("eager", [sourceSignal], deriver);
    const unsubscribe = derivedSignal.subscribe(() => {});

    emitUpstream("first");
    resolvers[0]("done");
    await Promise.resolve();
    expect(derivedSignal.get()).toBe("first:done");

    emitUpstream("second");
    failUpstream(new Error("upstream failed"));
    expect(sourceSignal.recoverFromError()).toBe(true);
    expect(derivedSignal.isStale()).toBe(true);

    resolvers[1]("outdated");
    await Promise.resolve();
    expect(derivedSignal.get()).toBe("first:done");
    expect(derivedSignal.isStale()).toBe(true);

    emitUpstream("second");
    resolvers[2]("recovered");
    await Promise.resolve();
    expect(derivedSignal.get()).toBe("second:recovered");
    expect(derivedSignal.isStale()).toBe(false);
    unsubscribe();
  });

  it("should wait for fresh source data before invoking the deriver", async () => {
    let emitUpstream: (value: string) => void = () => {};
    const sourceSignal = LazySignal.create("cached", setDownstream => {
      emitUpstream = setDownstream;
      return () => {};
    });
    const deriver = jest.fn(async (sourceValue: string) => `derived:${sourceValue}`);
    const derivedSignal = LazySignal.asyncDeriveFrom("eager", [sourceSignal], deriver);

    const pullPromise = derivedSignal.pull();
    await Promise.resolve();
    expect(deriver).not.toHaveBeenCalled();

    emitUpstream("fresh");
    await expect(pullPromise).resolves.toBe("derived:fresh");
    expect(deriver).toHaveBeenCalledTimes(1);
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

  it("should ignore work started before a source became stale", async () => {
    let emitUpstream: (value: string) => void = () => {};
    let failUpstream: (error: Error) => void = () => {};
    const sourceSignal = LazySignal.create("cached", (setDownstream, errorListener) => {
      emitUpstream = setDownstream;
      failUpstream = errorListener;
      return () => {};
    });
    const { deriver, invocations } = createControllableDeriver<string>();
    const derivedSignal = LazySignal.blockingAsyncDeriveFromWithThrottling(
      0,
      [sourceSignal],
      deriver,
    );
    const unsubscribe = derivedSignal.subscribe(() => {});

    emitUpstream("first");
    invocations[0].resolve("first-result");
    await Promise.resolve();
    expect(derivedSignal.get()).toBe("first-result");

    emitUpstream("second");
    failUpstream(new Error("upstream failed"));
    expect(sourceSignal.recoverFromError()).toBe(true);
    expect(derivedSignal.isStale()).toBe(true);

    invocations[1].resolve("outdated-result");
    await Promise.resolve();
    expect(derivedSignal.get()).toBe("first-result");
    expect(derivedSignal.isStale()).toBe(true);

    emitUpstream("second");
    expect(invocations).toHaveLength(3);
    invocations[2].resolve("recovered-result");
    await Promise.resolve();
    expect(derivedSignal.get()).toBe("recovered-result");
    expect(derivedSignal.isStale()).toBe(false);
    unsubscribe();
  });

  it("should wait for fresh source data before invoking the deriver", () => {
    let emitUpstream: (value: string) => void = () => {};
    const sourceSignal = LazySignal.create("cached", setDownstream => {
      emitUpstream = setDownstream;
      return () => {};
    });
    const { deriver, invocations } = createControllableDeriver<string>();
    const derivedSignal = LazySignal.blockingAsyncDeriveFromWithThrottling(
      0,
      [sourceSignal],
      deriver,
    );

    derivedSignal.subscribe(() => {});
    expect(invocations).toHaveLength(0);

    emitUpstream("fresh");
    expect(invocations).toHaveLength(1);
    expect(invocations[0].args).toEqual(["fresh"]);
  });

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

  it("should work correctly after unsubscribe and resubscribe with in-flight derive", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(0, [source], deriver);

    // First subscription: derive A starts
    const unsub1 = derived.subscribe(() => {});
    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // Unsubscribe while A's derive is still in-flight
    unsub1();

    // A's derive completes after unsubscribe
    invocations[0].resolve("result-A");
    await Promise.resolve();

    // Re-subscribe: should start a new derive for the current value
    setSource("B");
    derived.subscribe(() => {});
    await Promise.resolve();
    expect(invocations).toHaveLength(2);
    expect(invocations[1].args).toEqual(["B"]);
  });

  it("should silently ignore deriver rejection and continue processing", async () => {
    const [source, setSource] = Signal.create("A");
    const { deriver, invocations } = createControllableDeriver<string>();

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(0, [source], deriver);
    derived.subscribe(() => {});

    // A starts
    await Promise.resolve();
    expect(invocations).toHaveLength(1);

    // Queue B, then reject A
    setSource("B");
    invocations[0].reject(new Error("derive failed"));
    await Promise.resolve();

    // Error is not surfaced on errorSignal (deriver errors are transient)
    expect(derived.errorSignal.get()).toBe(null);

    // Pipeline continues: B's derive starts
    expect(invocations).toHaveLength(2);
    expect(invocations[1].args).toEqual(["B"]);

    // B succeeds — result is applied normally
    invocations[1].resolve("result-B");
    await Promise.resolve();
    expect(derived.get()).toBe("result-B");
  });

  it("should handle synchronous throws from the deriver without freezing", async () => {
    const [source, setSource] = Signal.create("A");
    let callCount = 0;
    const { deriver, invocations } = createControllableDeriver<string>();

    // Deriver that throws synchronously on first call, then delegates to controllable deriver
    const throwOnceDeriver = (...args: Array<unknown>): Promise<string> => {
      callCount++;
      if (callCount === 1) {
        throw new Error("sync explosion");
      }
      return deriver(...args);
    };

    const derived = LazySignal.blockingAsyncDeriveFromWithThrottling(0, [source], throwOnceDeriver);
    derived.subscribe(() => {});

    // A's derive throws synchronously — should not crash or freeze
    await Promise.resolve();
    expect(callCount).toBe(1);

    // Emit B — pipeline should not be stuck
    setSource("B");
    await Promise.resolve();
    expect(callCount).toBe(2);
    expect(invocations).toHaveLength(1);
    expect(invocations[0].args).toEqual(["B"]);

    // B completes normally
    invocations[0].resolve("result-B");
    await Promise.resolve();
    expect(derived.get()).toBe("result-B");
  });
});
