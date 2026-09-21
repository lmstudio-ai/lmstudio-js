import { flattenSignalOfSignal, flattenSignalOfWritableSignal } from "./flattenSignal.js";
import { LazySignal, type StripNotAvailable } from "./LazySignal.js";
import { makePromise } from "./makePromise.js";
import { type Setter } from "./makeSetter.js";
import { OWLSignal } from "./OWLSignal.js";
import { Signal } from "./Signal.js";

/** Models a writable transport whose snapshots, disconnects, and recovery are controlled by the test. */
function createSource<TData>(initialValue: TData) {
  let publish!: Setter<TData>;
  let fail!: (error: Error) => void;
  const stop = jest.fn();
  const [signal, setter] = OWLSignal.create(
    initialValue,
    (setDownstream, onError) => {
      publish = setDownstream;
      fail = onError;
      return stop;
    },
    (value, patches, tags) => {
      publish.withValueAndPatches(value, patches, tags);
      return true;
    },
  );
  return {
    signal,
    setter,
    stop,
    /** Delivers a fresh snapshot to the current subscription. */
    publish: (value: StripNotAvailable<TData>) => publish(value),
    /** Ends the current transport subscription with an error. */
    fail: (error: Error) => fail(error),
  };
}

describe("composed signal errors", () => {
  /** Every derivation form must expose writable-source failures, including before the first snapshot. */
  it.each(["sync", "async", "throttled"] as const)(
    "propagates OWLSignal errors through %s derivation",
    async mode => {
      const source = createSource(0);
      const derived =
        mode === "sync"
          ? LazySignal.deriveFrom([source.signal], value => value + 1)
          : mode === "async"
            ? LazySignal.asyncDeriveFrom("eager", [source.signal], async value => value + 1)
            : LazySignal.blockingAsyncDeriveFromWithThrottling(
                0,
                [source.signal],
                async value => value + 1,
              );
      const unsubscribe = derived.subscribe(() => {});
      for (const value of [2, 4]) {
        const error = new Error("Disconnected");
        source.fail(error);
        expect(derived.errorSignal.get()).toBe(error);
        expect(derived.isStale()).toBe(true);
        expect(source.signal.recoverFromError()).toBe(true);
        expect(derived.errorSignal.get()).toBeNull();
        expect(derived.isStale()).toBe(true);
        source.publish(value);
        await Promise.resolve();
        expect(derived.get()).toBe(value + 1);
        expect(derived.isStale()).toBe(false);
      }
      unsubscribe();
      expect(source.stop).toHaveBeenCalledTimes(1);
    },
  );

  /** One dependency recovering must leave the other dependency's error visible. */
  it.each([0, 1])("keeps errors until both sources recover, starting with source %s", first => {
    const sources = [createSource(0), createSource(0)];
    const derived = LazySignal.deriveFrom(
      sources.map(source => source.signal),
      (...values) => values[0] + values[1],
    );
    const unsubscribe = derived.subscribe(() => {});
    const errors = [new Error("First connection"), new Error("Second connection")];
    sources.forEach((source, index) => source.fail(errors[index]));
    expect(derived.errorSignal.get()).toBe(errors[0]);
    sources[first].signal.recoverFromError();
    sources[first].publish(2);
    expect(derived.errorSignal.get()).toBe(errors[1 - first]);
    expect(derived.isStale()).toBe(true);
    sources[1 - first].signal.recoverFromError();
    expect(derived.errorSignal.get()).toBeNull();
    expect(derived.isStale()).toBe(true);
    sources[1 - first].publish(3);
    expect(derived.get()).toBe(5);
    expect(derived.isStale()).toBe(false);
    unsubscribe();
  });

  /** Both flatteners observe real optimistic writable sources and resume after reconnection. */
  it.each([false, true])("propagates OWLSignal inner errors (writable=%s)", async writable => {
    const source = createSource(0);
    const [flattened, setter] = writable
      ? flattenSignalOfWritableSignal(
          Signal.createReadonly([source.signal, source.setter] as const),
        )
      : ([flattenSignalOfSignal(Signal.createReadonly(source.signal)), undefined] as const);
    const unsubscribe = flattened.subscribe(() => {});
    source.publish(1);
    const error = new Error("Disconnected");
    source.fail(error);
    expect(flattened.errorSignal.get()).toBe(error);
    expect(flattened.isStale()).toBe(true);
    expect(flattened.get()).toBe(1);
    source.signal.recoverFromError();
    expect(flattened.errorSignal.get()).toBeNull();
    expect(flattened.isStale()).toBe(true);
    source.publish(2);
    expect(flattened.isStale()).toBe(false);
    if (setter !== undefined) {
      setter(3);
      await Promise.resolve();
      expect(source.signal.get()).toBe(3);
      expect(flattened.get()).toBe(3);
    }
    unsubscribe();
    expect(source.stop).toHaveBeenCalledTimes(1);
  });

  /** Root and inner failures have independent lifetimes, including when the root has no initial snapshot. */
  it.each([false, true])(
    "propagates root failures and retains inner failures (writable=%s)",
    writable => {
      const inner = createSource(0);
      // Keep each root's type concrete so both public flattener contracts are checked.
      const readRoot = createSource(inner.signal);
      const writeRoot = createSource([inner.signal, inner.setter] as const);
      const root = writable ? writeRoot : readRoot;
      const flattened = writable
        ? flattenSignalOfWritableSignal(writeRoot.signal)[0]
        : flattenSignalOfSignal(readRoot.signal);
      const unsubscribe = flattened.subscribe(() => {});
      const rootError = new Error("Root failed");
      root.fail(rootError);
      expect(flattened.errorSignal.get()).toBe(rootError);
      root.signal.recoverFromError();
      if (writable) writeRoot.publish([inner.signal, inner.setter]);
      else readRoot.publish(inner.signal);
      const innerError = new Error("Inner failed");
      inner.fail(innerError);
      root.fail(rootError);
      expect(flattened.errorSignal.get()).toBe(rootError);
      root.signal.recoverFromError();
      expect(flattened.errorSignal.get()).toBe(innerError);
      if (writable) writeRoot.publish([inner.signal, inner.setter]);
      else readRoot.publish(inner.signal);
      inner.signal.recoverFromError();
      expect(flattened.errorSignal.get()).toBeNull();
      expect(flattened.isStale()).toBe(true);
      inner.publish(7);
      expect(flattened.get()).toBe(7);
      expect(flattened.isStale()).toBe(false);
      unsubscribe();
    },
  );

  /** Switching targets releases the old error listener; final disposal releases the current one. */
  it.each([false, true])(
    "cleans up errors when switching and disposing (writable=%s)",
    writable => {
      const previous = createSource(0);
      const current = createSource(0);
      const stops = [jest.fn(), jest.fn()];
      const subscriptions = [previous, current].map((source, index) => {
        const subscribe = source.signal.errorSignal.subscribe.bind(source.signal.errorSignal);
        return jest.spyOn(source.signal.errorSignal, "subscribe").mockImplementation(listener => {
          const unsubscribe = subscribe(listener);
          return () => {
            unsubscribe();
            stops[index]();
          };
        });
      });
      const [readRoot, setReadRoot] = Signal.create(previous.signal);
      const [writeRoot, setWriteRoot] = Signal.create([previous.signal, previous.setter] as const);
      const flattened = writable
        ? flattenSignalOfWritableSignal(writeRoot)[0]
        : flattenSignalOfSignal(readRoot);
      const unsubscribe = flattened.subscribe(() => {});
      previous.fail(new Error("Old connection failed"));
      expect(flattened.errorSignal.get()).not.toBeNull();
      if (writable) setWriteRoot([current.signal, current.setter]);
      else setReadRoot(current.signal);
      expect(stops[0]).toHaveBeenCalledTimes(subscriptions[0].mock.calls.length);
      expect(subscriptions[0]).toHaveBeenCalled();
      expect(flattened.errorSignal.get()).toBeNull();
      current.publish(9);
      previous.signal.recoverFromError();
      const keepPreviousAlive = previous.signal.subscribe(() => {});
      previous.fail(new Error("Old connection failed again"));
      expect(flattened.errorSignal.get()).toBeNull();
      expect(flattened.get()).toBe(9);
      unsubscribe();
      expect(stops[1]).toHaveBeenCalledTimes(subscriptions[1].mock.calls.length);
      expect(current.stop).toHaveBeenCalledTimes(1);
      keepPreviousAlive();
    },
  );

  /** Eager async results are ordered by their input revision, including failures. */
  it.each(["older-success", "older-error", "newer-success", "newer-error"] as const)(
    "handles overlapping async work: %s",
    async order => {
      const [source, setSource] = Signal.create(0);
      const work = [makePromise<number>(), makePromise<number>()];
      const derived = LazySignal.asyncDeriveFrom("eager", [source], value => work[value].promise);
      const unsubscribe = derived.subscribe(() => {});
      setSource(1);
      const error = new Error("Lookup failed");
      if (order === "older-success" || order === "older-error") {
        if (order === "older-success") work[0].resolve(10);
        else work[0].reject(error);
        await Promise.resolve();
        if (order === "older-success") expect(derived.get()).toBe(10);
        else expect(derived.errorSignal.get()).toBe(error);
        if (order === "older-success") work[1].reject(error);
        else work[1].resolve(20);
      } else {
        if (order === "newer-success") work[1].resolve(20);
        else work[1].reject(error);
        await Promise.resolve();
        if (order === "newer-success") work[0].reject(error);
        else work[0].resolve(10);
      }
      await Promise.resolve();
      const failed = order === "older-success" || order === "newer-error";
      expect(derived.errorSignal.get()).toBe(failed ? error : null);
      expect(derived.isStale()).toBe(failed);
      if (!failed) expect(derived.get()).toBe(20);
      unsubscribe();
    },
  );

  /** In-flight work cannot clear a transport failure or revive data from a disconnected source. */
  it.each([false, true])(
    "ignores async work invalidated by a source failure (reject=%s)",
    async reject => {
      const source = createSource(0);
      const work = makePromise<number>();
      const derived = LazySignal.asyncDeriveFrom(
        "eager",
        [source.signal],
        (_value: number) => work.promise,
      );
      const unsubscribe = derived.subscribe(() => {});
      source.publish(1);
      const error = new Error("Connection failed");
      source.fail(error);
      if (reject) work.reject(new Error("Outdated lookup failed"));
      else work.resolve(1);
      await Promise.resolve();
      expect(derived.errorSignal.get()).toBe(error);
      expect(derived.isStale()).toBe(true);
      unsubscribe();
    },
  );
});
