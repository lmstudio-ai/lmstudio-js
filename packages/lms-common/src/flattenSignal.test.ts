import { flattenSignalOfSignal, flattenSignalOfWritableSignal } from "./flattenSignal.js";
import { LazySignal } from "./LazySignal.js";
import { type Setter } from "./makeSetter.js";
import { Signal } from "./Signal.js";

async function waitForTick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe("flattenSignalOfSignal", () => {
  it("should preserve nested patches and tags from a stable inner signal", async () => {
    const [innerSignal, setInnerSignal] = Signal.create({
      nested: {
        count: 0,
      },
      label: "alpha",
    });
    const outerSignal = Signal.createReadonly(innerSignal);
    const flattenedSignal = flattenSignalOfSignal(outerSignal);

    expect(await flattenedSignal.pull()).toEqual({
      nested: {
        count: 0,
      },
      label: "alpha",
    });

    const callbackFull = jest.fn();
    flattenedSignal.subscribeFull(callbackFull);

    setInnerSignal.withProducer(
      draft => {
        draft.nested.count = 1;
      },
      ["nested-tag"],
    );

    expect(callbackFull).toHaveBeenCalledWith(
      {
        nested: {
          count: 1,
        },
        label: "alpha",
      },
      [{ op: "replace", path: ["nested", "count"], value: 1 }],
      ["nested-tag"],
    );
  });

  it("should emit a root replace when switching to a different inner signal", async () => {
    const [innerSignal1] = Signal.create({
      nested: {
        count: 0,
      },
    });
    const [innerSignal2] = Signal.create({
      nested: {
        count: 5,
      },
    });
    const [outerSignal, setOuterSignal] = Signal.create(innerSignal1);
    const flattenedSignal = flattenSignalOfSignal(outerSignal);

    expect(await flattenedSignal.pull()).toEqual({
      nested: {
        count: 0,
      },
    });

    const callbackFull = jest.fn();
    flattenedSignal.subscribeFull(callbackFull);

    setOuterSignal(innerSignal2);

    expect(callbackFull).toHaveBeenCalledWith(
      {
        nested: {
          count: 5,
        },
      },
      [{ op: "replace", path: [], value: { nested: { count: 5 } } }],
      [],
    );
  });

  it("should keep the last available value when switching to an inner signal that is not available yet", async () => {
    const [innerSignalA, setInnerSignalA] = Signal.create(1);
    let emitInnerSignalB: ((value: number) => void) | null = null;
    const innerSignalB = LazySignal.createWithoutInitialValue<number>(setDownstream => {
      emitInnerSignalB = setDownstream;
      return () => {};
    });
    const [outerSignal, setOuterSignal] = Signal.create<typeof innerSignalA | typeof innerSignalB>(
      innerSignalA,
    );
    const flattenedSignal = flattenSignalOfSignal(outerSignal);

    const callback = jest.fn();
    const unsubscribe = flattenedSignal.subscribe(callback);

    expect(await flattenedSignal.pull()).toBe(1);
    callback.mockClear();

    setOuterSignal(innerSignalB);

    expect(callback).not.toHaveBeenCalled();
    expect(flattenedSignal.get()).toBe(1);

    setInnerSignalA(2);

    expect(callback).not.toHaveBeenCalled();
    expect(flattenedSignal.get()).toBe(1);

    (emitInnerSignalB as any as Setter<number>)?.(3);

    expect(callback).toHaveBeenCalledWith(3);
    expect(flattenedSignal.get()).toBe(3);

    unsubscribe();
  });

  it("should wait for the new inner signal to become available when pull is called while stale", async () => {
    const [innerSignalA] = Signal.create(1);
    let emitInnerSignalB: ((value: number) => void) | null = null;
    const innerSignalB = LazySignal.createWithoutInitialValue<number>(setDownstream => {
      emitInnerSignalB = setDownstream;
      return () => {};
    });
    const [outerSignal, setOuterSignal] = Signal.create<typeof innerSignalA | typeof innerSignalB>(
      innerSignalA,
    );
    const flattenedSignal = flattenSignalOfSignal(outerSignal);

    const unsubscribe = flattenedSignal.subscribe(() => {});
    expect(await flattenedSignal.pull()).toBe(1);
    unsubscribe();
    await waitForTick();

    setOuterSignal(innerSignalB);
    expect(flattenedSignal.get()).toBe(1);

    const pullPromise = flattenedSignal.pull();
    let resolved = false;
    pullPromise.then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(resolved).toBe(false);

    (emitInnerSignalB as any as Setter<number>)?.(7);

    await expect(pullPromise).resolves.toBe(7);
    expect(flattenedSignal.get()).toBe(7);
  });
});

describe("flattenSignalOfWritableSignal", () => {
  it("should preserve nested patches and tags from a stable inner writable signal", async () => {
    const innerWritableSignal = Signal.create({
      nested: {
        count: 0,
      },
      label: "alpha",
    });
    const outerSignal = Signal.createReadonly(innerWritableSignal);
    const [flattened] = flattenSignalOfWritableSignal(outerSignal);

    expect(await flattened.pull()).toEqual({
      nested: {
        count: 0,
      },
      label: "alpha",
    });

    const callbackFull = jest.fn();
    flattened.subscribeFull(callbackFull);

    innerWritableSignal[1].withProducer(
      draft => {
        draft.nested.count = 1;
      },
      ["nested-tag"],
    );

    expect(callbackFull).toHaveBeenCalledWith(
      {
        nested: {
          count: 1,
        },
        label: "alpha",
      },
      [{ op: "replace", path: ["nested", "count"], value: 1 }],
      ["nested-tag"],
    );
  });

  it("should preserve empty patches when the inner writable signal only flushes tags", async () => {
    const innerWritableSignal = Signal.create({
      nested: {
        count: 0,
      },
    });
    const outerSignal = Signal.createReadonly(innerWritableSignal);
    const [flattened] = flattenSignalOfWritableSignal(outerSignal);

    expect(await flattened.pull()).toEqual({
      nested: {
        count: 0,
      },
    });

    const callbackFull = jest.fn();
    flattened.subscribeFull(callbackFull);

    const currentValue = innerWritableSignal[0].get();
    innerWritableSignal[1].withValueAndPatches(currentValue, [], ["tag-only"]);

    expect(callbackFull).toHaveBeenCalledWith(currentValue, [], ["tag-only"]);
  });

  it("should work when outer signal is not changing", async () => {
    const innerWritableSignal = Signal.create(0);
    const outerSignal = Signal.createReadonly(innerWritableSignal);
    const [flattened, setFlattened] = flattenSignalOfWritableSignal(outerSignal);

    expect(await flattened.pull()).toBe(0);

    setFlattened(1);

    expect(await flattened.pull()).toBe(1);

    const callback = jest.fn();
    flattened.subscribe(callback);

    setFlattened(2);

    expect(callback).toHaveBeenCalledWith(2);

    const callbackFull = jest.fn();
    flattened.subscribeFull(callbackFull);

    setFlattened(3, ["some-tag"]);

    expect(callbackFull).toHaveBeenCalledWith(
      3,
      [{ op: "replace", path: [], value: 3 }],
      ["some-tag"],
    );

    innerWritableSignal[1](4);

    expect(await flattened.pull()).toBe(4);
    expect(callback).toHaveBeenCalledWith(4);
    expect(callbackFull).toHaveBeenCalledWith(4, [{ op: "replace", path: [], value: 4 }], []);
  });

  it("should preserve queued update patches when the inner writable signal becomes available later", async () => {
    const [outerSignal, setOuterSignal] = Signal.create<
      | readonly [
          signal: ReturnType<typeof Signal.create<{ nested: { count: number } }>>[0],
          setter: ReturnType<typeof Signal.create<{ nested: { count: number } }>>[1],
        ]
      | typeof LazySignal.NOT_AVAILABLE
    >(LazySignal.NOT_AVAILABLE);
    const [flattened, setFlattened] = flattenSignalOfWritableSignal(outerSignal);

    const callbackFull = jest.fn();
    flattened.subscribeFull(callbackFull);

    setFlattened.withProducer(
      draft => {
        draft.nested.count = 1;
      },
      ["queued-tag"],
    );

    const innerWritableSignal = Signal.create({
      nested: {
        count: 0,
      },
    });

    setOuterSignal(innerWritableSignal);
    await waitForTick();

    expect(await flattened.pull()).toEqual({
      nested: {
        count: 1,
      },
    });

    expect(callbackFull).toHaveBeenLastCalledWith(
      {
        nested: {
          count: 1,
        },
      },
      [{ op: "replace", path: ["nested", "count"], value: 1 }],
      ["queued-tag"],
    );
  });

  it("should stop forwarding updates from the previous inner writable signal after switching", async () => {
    const innerWritableSignal1 = Signal.create(0);
    const innerWritableSignal2 = Signal.create(10);
    const [outerSignal, setOuter] = Signal.create(innerWritableSignal1);
    const [flattened] = flattenSignalOfWritableSignal(outerSignal);

    const unsubscribeKeepAlive = flattened.subscribe(() => {});
    expect(await flattened.pull()).toBe(0);

    const callback = jest.fn();
    const unsubscribeCallback = flattened.subscribe(callback);

    setOuter(innerWritableSignal2);
    expect(await flattened.pull()).toBe(10);
    callback.mockClear();

    innerWritableSignal1[1](1);

    expect(callback).not.toHaveBeenCalled();
    expect(await flattened.pull()).toBe(10);

    unsubscribeCallback();
    unsubscribeKeepAlive();
  });

  it("should continue writing to the current inner writable signal after switching", async () => {
    const innerWritableSignal1 = Signal.create(0);
    const innerWritableSignal2 = Signal.create(10);
    const [outerSignal, setOuter] = Signal.create(innerWritableSignal1);
    const [flattened, setFlattened] = flattenSignalOfWritableSignal(outerSignal);

    const unsubscribeKeepAlive = flattened.subscribe(() => {});
    expect(await flattened.pull()).toBe(0);

    setOuter(innerWritableSignal2);
    expect(await flattened.pull()).toBe(10);

    // This update should be ignored because innerWritableSignal1 is no longer the active inner
    // signal.
    innerWritableSignal1[1](1);
    setFlattened(99);

    expect(innerWritableSignal1[0].get()).toBe(1);
    expect(innerWritableSignal2[0].get()).toBe(99);

    unsubscribeKeepAlive();
  });

  it("should work when outer signal is not changing and setter is called before init", async () => {
    const innerWritableSignal = Signal.create(0);
    const outerSignal = Signal.createReadonly(innerWritableSignal);
    const [flattened, setFlattened] = flattenSignalOfWritableSignal(outerSignal);

    setFlattened(1);

    expect(await flattened.pull()).toBe(1);
  });

  it("should be able to unsubscribe", async () => {
    const innerWritableSignal = Signal.create(0);
    const outerSignal = Signal.createReadonly(innerWritableSignal);
    const [flattened, setFlattened] = flattenSignalOfWritableSignal(outerSignal);

    const callback = jest.fn();
    const unsubscribe = flattened.subscribe(callback);

    setFlattened(1);

    expect(callback).toHaveBeenCalledWith(1);

    unsubscribe();

    setFlattened(2);

    expect(callback).toHaveBeenCalledTimes(1);

    // isStale will only be true after some microtasks. This is not ideal, but a limitation of
    // LazySignal.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(flattened.isStale()).toBe(true);
  });

  it("should work when outer signal is changing", async () => {
    const innerWritableSignal1 = Signal.create(0);
    const innerWritableSignal2 = Signal.create(1);
    const [outerSignal, setOuter] = Signal.create(innerWritableSignal1);
    const [flattened, setFlattened] = flattenSignalOfWritableSignal(outerSignal);

    expect(await flattened.pull()).toBe(0);

    setOuter(innerWritableSignal2);

    expect(await flattened.pull()).toBe(1);

    setFlattened(2);

    expect(await flattened.pull()).toBe(2);
    expect(innerWritableSignal1[0].get()).toBe(0);
    expect(innerWritableSignal2[0].get()).toBe(2);

    const callback = jest.fn();
    flattened.subscribe(callback);
    const callbackFull = jest.fn();
    flattened.subscribeFull(callbackFull);
    setOuter(innerWritableSignal1);

    expect(callback).toHaveBeenCalledWith(0);
    expect(callbackFull).toHaveBeenCalledWith(0, [{ op: "replace", path: [], value: 0 }], []);

    innerWritableSignal1[1](3);

    expect(await flattened.pull()).toBe(3);
    expect(callback).toHaveBeenCalledWith(3);
    expect(callbackFull).toHaveBeenCalledWith(3, [{ op: "replace", path: [], value: 3 }], []);
  });
});
