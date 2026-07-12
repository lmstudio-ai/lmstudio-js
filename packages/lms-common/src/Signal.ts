import { type Patch } from "@lmstudio/immer-with-plugins";
import { type StripNotAvailable } from "./LazySignal.js";
import { Subscribable } from "./Subscribable.js";
import { makePromise } from "./makePromise.js";
import { makeSetterWithPatches, type Setter, type WriteTag } from "./makeSetter.js";

const equals = <TValue>(a: TValue, b: TValue) => a === b;

type Updater<TValue> = (oldValue: TValue) => readonly [TValue, Array<Patch>];
export type Subscriber<TValue> = (value: TValue) => void;

export type SignalFullSubscriber<TValue> = (
  value: TValue,
  patches: Array<Patch>,
  tags: Array<WriteTag>,
) => void;

type InternalSubscriber<TValue> =
  | {
      type: "regular";
      callback: Subscriber<TValue>;
    }
  | {
      type: "full";
      callback: SignalFullSubscriber<TValue>;
    };

interface QueuedUpdate<TValue> {
  updater: Updater<TValue>;
  tags?: Array<WriteTag>;
  nextStale?: boolean;
}

/**
 * A signal is a wrapper for a value. It can be used to notify subscribers when the value changes.
 * For it to work properly, the value should be immutable.
 *
 * To create a signal, please use the `Signal.create` static method. It will return a signal
 * along with a function to update its value.
 */
export class Signal<TValue> extends Subscribable<TValue> implements SignalLike<TValue> {
  /**
   * Creates a signal.
   *
   * @param value - The initial value of the signal.
   * @param equalsPredicate - A function to compare two values. The subscribers will only be called
   * if the value changes according to the `equalsPredicate`. By default, it uses the `===`
   * operator.
   * @returns This method returns a tuple with two elements:
   * - The signal
   * - A function to update the value
   **/
  public static create<TValue>(
    value: TValue,
    equalsPredicate: (a: TValue, b: TValue) => boolean = equals,
  ): readonly [Signal<TValue>, Setter<TValue>] {
    const signal = new Signal(value, equalsPredicate);
    const setter = makeSetterWithPatches<TValue>((updater, tags) => {
      signal.update(updater, tags);
    });
    return [signal, setter] as const;
  }

  /**
   * Creates a signal whose value and stale state are committed by the same update queue.
   *
   * The preserving setter leaves freshness unchanged. The fresh setter restores freshness with its
   * value, and markStale can carry acknowledgement tags without changing the value.
   */
  public static createWithStaleState<TValue>(
    value: TValue,
    initialStale: boolean,
    equalsPredicate: (a: TValue, b: TValue) => boolean = equals,
  ) {
    const signal = new Signal(value, equalsPredicate, initialStale);
    const setValue = makeSetterWithPatches<TValue>((updater, tags) => {
      signal.update(updater, tags);
    });
    const setFreshValue = makeSetterWithPatches<TValue>((updater, tags) => {
      signal.update(updater, tags, false);
    });
    const markStale = (tags?: Array<WriteTag>) => {
      signal.update(value => [value, []], tags, true);
    };
    return { signal, setValue, setFreshValue, markStale };
  }

  public static createReadonly<TValue>(value: TValue): Signal<TValue> {
    return Signal.create(value)[0];
  }

  protected constructor(
    private value: TValue,
    private equalsPredicate: (a: TValue, b: TValue) => boolean,
    initialStale?: boolean,
  ) {
    super();
    if (initialStale !== undefined) {
      this.staleSignal = new Signal<boolean>(initialStale, equals);
    }
  }

  private subscribers: Set<InternalSubscriber<TValue>> = new Set();
  /** Present for signals that track value freshness. */
  public readonly staleSignal?: Signal<boolean>;

  /** Returns the current value. */
  public get() {
    return this.value;
  }

  public pull() {
    return this.value as StripNotAvailable<TValue>;
  }

  private queuedUpdates: Array<QueuedUpdate<TValue>> = [];
  private isEmitting = false;

  private notifyFull(value: TValue, patches: Array<Patch>, tags: Array<WriteTag>) {
    for (const { type, callback } of this.subscribers) {
      if (type === "full") {
        callback(value, patches, tags);
      }
    }
  }

  private notifyAll(value: TValue, patches: Array<Patch>, tags: Array<WriteTag>) {
    for (const { type, callback } of this.subscribers) {
      if (type === "regular") {
        callback(value);
      } else {
        callback(value, patches, tags);
      }
    }
  }

  private isReplaceRoot(patch: Patch) {
    return patch.path.length === 0 && patch.op === "replace";
  }

  /** Queues one value/freshness operation and emits only fully committed state. */
  private update(updater: Updater<TValue>, tags?: Array<WriteTag>, nextStale?: boolean) {
    this.queuedUpdates.push({ updater, tags, nextStale });
    if (this.isEmitting) {
      return;
    }
    this.isEmitting = true;
    try {
      while (this.queuedUpdates.length > 0) {
        let value = this.value;
        let stale = this.staleSignal?.get();
        const previousStale = stale;
        let patches: Array<Patch> = [];
        const tags: Array<WriteTag> = [];

        while (this.queuedUpdates.length > 0) {
          const update = this.queuedUpdates.shift()!;
          const [newValue, newPatches] = update.updater(value);
          value = newValue;
          const rootReplacerIndex = newPatches.findIndex(this.isReplaceRoot);
          if (rootReplacerIndex !== -1) {
            patches = newPatches.slice(rootReplacerIndex);
          } else {
            patches.push(...newPatches);
          }
          if (update.tags !== undefined) {
            tags.push(...update.tags);
          }
          if (update.nextStale !== undefined) {
            stale = update.nextStale;
          }
        }

        const valueChanged = !this.equalsPredicate(this.value, value);
        const staleChanged = previousStale !== stale;
        const becameFresh = previousStale === true && stale === false;
        if (valueChanged) {
          this.value = value;
        } else if (value !== this.value) {
          // A custom equality predicate kept the old value, so candidate patches were not applied.
          patches = [];
        }
        if (staleChanged) {
          this.staleSignal!.value = stale!;
        }

        if (valueChanged || becameFresh) {
          this.notifyAll(this.value, patches, tags);
        } else if (tags.length > 0) {
          this.notifyFull(this.value, patches, tags);
        }
        if (staleChanged) {
          this.staleSignal!.notifyAll(stale!, [{ op: "replace", path: [], value: stale }], []);
        }
      }
    } finally {
      this.isEmitting = false;
    }
  }

  /**
   * Subscribes to the signal. The callback will be called whenever the value changes. All callbacks
   * are called synchronously upon updating. It will NOT be immediately called with the current
   * value. (Use `get()` to get the current value.) Returns a function to unsubscribe.
   *
   * Edge cases involving manipulating the signal in the callback:
   *
   * - If the callback adds new subscribers, they will also be called within the same update.
   * - If the callback causes removal of subscribers that have not been called yet, they will no
   *   longer be called.
   * - If the callback causes an update of the value, the update will be queued. If multiple updates
   *   are queued, only the final combined value will be emitted.
   *
   * Edge cases involving adding the same callback multiple times.
   *
   *  - Callbacks are tracked with a set. Adding the same subscriber will not cause it to be called
   *    multiple times.
   */
  public subscribe(callback: Subscriber<TValue>): () => void {
    const subscriber: InternalSubscriber<TValue> = {
      type: "regular",
      callback,
    };
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** Subscribes and immediately calls the callback with the current value. */
  public subscribeAndNow(callback: Subscriber<TValue>): () => void {
    const unsubscribe = this.subscribe(callback);
    callback(this.value);
    return unsubscribe;
  }

  public subscribeFull(callback: SignalFullSubscriber<TValue>): () => void {
    const subscriber: InternalSubscriber<TValue> = {
      type: "full",
      callback,
    };
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** Waits until the signal satisfies a predicate. */
  public async until(predicate: (data: TValue) => boolean): Promise<TValue> {
    const current = this.get();
    if (predicate(current)) {
      return current;
    }
    const { promise, resolve } = makePromise<TValue>();
    const unsubscribe = this.subscribe(data => {
      if (predicate(data)) {
        resolve(data);
        unsubscribe();
      }
    });
    return await promise;
  }
}

export interface SignalLike<TValue> extends Subscribable<TValue> {
  /**
   * Present when the signal can report whether its cached value is stale. A stale-to-fresh
   * transition must also emit one value event, even when the committed value compares equal.
   */
  readonly staleSignal?: Signal<boolean>;
  get(): TValue;
  subscribe(subscriber: Subscriber<TValue>): () => void;
  subscribeFull(subscriber: SignalFullSubscriber<TValue>): () => void;
  pull(): Promise<StripNotAvailable<TValue>> | StripNotAvailable<TValue>;
}

export type WritableSignal<TValue> = readonly [
  signal: SignalLike<TValue>,
  setter: Setter<StripNotAvailable<TValue>>,
];
