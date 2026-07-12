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

/** Receives a full update and whether that update is based on fresh source data. */
export type SignalFullSubscriberWithFreshness<TValue> = (
  value: TValue,
  patches: Array<Patch>,
  tags: Array<WriteTag>,
  isFresh: boolean,
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
    const update = (updater: Updater<TValue>, tags?: Array<WriteTag>) => {
      signal.update(updater, tags);
    };
    const setter = makeSetterWithPatches(update);
    return [signal, setter] as const;
  }
  public static createReadonly<TValue>(value: TValue): Signal<TValue> {
    return Signal.create(value)[0];
  }
  protected constructor(
    private value: TValue,
    private equalsPredicate: (a: TValue, b: TValue) => boolean,
  ) {
    super();
  }
  private subscribers: Set<InternalSubscriber<TValue>> = new Set();
  /**
   * Returns the current value of the signal.
   */
  public get() {
    return this.value;
  }
  public pull() {
    return this.value as StripNotAvailable<TValue>;
  }
  private queuedUpdaters: Array<[updater: Updater<TValue>, tags?: Array<WriteTag>]> = [];
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
  private notifyAndUpdateIfChanged(value: TValue, patches: Array<Patch>, tags: Array<WriteTag>) {
    // If the value has changed, or if there are any tags that need to be flushed, notify
    if (!this.equalsPredicate(this.value, value)) {
      this.value = value;
      // If the values have changed, notify everyone
      this.notifyAll(value, patches, tags);
    } else if (tags.length > 0) {
      // If values not changed, but there is a tag to be flushed, notify only full subscribers
      this.notifyFull(value, patches, tags);
    }
  }

  private isReplaceRoot(patch: Patch) {
    return patch.path.length === 0 && patch.op === "replace";
  }

  private update(updater: Updater<TValue>, tags?: Array<WriteTag>) {
    this.queuedUpdaters.push([updater, tags]);
    // Only one concurrent update may emit
    if (this.isEmitting) {
      return;
    }
    this.isEmitting = true;
    try {
      // Outer while is for handling new updates caused by the notify
      while (this.queuedUpdaters.length > 0) {
        let value = this.value;
        let patches: Array<Patch> = [];
        const tags: Array<WriteTag> = [];
        // Inner while is for handling multiple updates
        while (this.queuedUpdaters.length > 0) {
          const [updater, newTags] = this.queuedUpdaters.shift()!;
          const [newValue, newPatches] = updater(value);
          value = newValue;
          // Extremely rudimentary patch merging
          const rootReplacerIndex = newPatches.findIndex(this.isReplaceRoot);
          if (rootReplacerIndex !== -1) {
            patches = newPatches.slice(rootReplacerIndex);
          } else {
            patches.push(...newPatches);
          }
          if (newTags !== undefined) {
            tags.push(...newTags);
          }
        }
        this.notifyAndUpdateIfChanged(value, patches, tags);
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
   *   are queued, only the last one will be executed.
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

  /**
   * Subscribes to the signal with the callback and trigger the callback immediately with the
   * current value.
   */
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

  /**
   * Wait until the signal satisfies a predicate. If the predicate is already satisfied, it will
   * return immediately. Otherwise, it will wait until the signal satisfies the predicate.
   */
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
  /** Present when the signal can report whether its cached value is stale. */
  readonly staleSignal?: Signal<boolean>;
  get(): TValue;
  subscribe(subscriber: Subscriber<TValue>): () => void;
  subscribeFull(subscriber: SignalFullSubscriber<TValue>): () => void;
  /**
   * Reports freshness on the value update itself, before a later staleSignal notification. Signals
   * that can emit local updates while stale should implement this method.
   */
  subscribeFullWithFreshness?(subscriber: SignalFullSubscriberWithFreshness<TValue>): () => void;
  pull(): Promise<StripNotAvailable<TValue>> | StripNotAvailable<TValue>;
}

export type WritableSignal<TValue> = readonly [
  signal: SignalLike<TValue>,
  setter: Setter<StripNotAvailable<TValue>>,
];
