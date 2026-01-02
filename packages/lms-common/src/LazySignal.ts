import { Signal, type SignalFullSubscriber, type SignalLike, type Subscriber } from "./Signal.js";
import { Subscribable } from "./Subscribable.js";
import { SyncEvent } from "./SyncEvent.js";
import { makePromise } from "./makePromise.js";
import { makeSetterWithPatches, type Setter } from "./makeSetter.js";

const isLazySignalSymbol = Symbol("isLazySignal");
export type NotAvailable = typeof LazySignal.NOT_AVAILABLE;
export type StripNotAvailable<T> = T extends NotAvailable ? never : T;
export function isAvailable<T>(data: T): data is StripNotAvailable<T> {
  return data !== LazySignal.NOT_AVAILABLE;
}

/**
 * When deriving with an async function, how to reconcile multiple updates coming in out of order.
 *
 * - "eager": Always apply the change as long as the update is newer than the last one.
 */
export type AsyncDeriveFromStrategy = "eager";

export type SubscribeUpstream<TData> = (
  /**
   * The setter function that should be called whenever the upstream emits a new value. The setter
   * function should be called with the new value.
   */
  setDownstream: Setter<TData>,
  /**
   * The error listener should be called when the upstream subscription encounters an error. Once
   * and error is encountered, the subscription to the upstream is assumed to be terminated, meaning
   * the unsubscriber will NOT be called.
   */
  errorListener: (error: any) => void,
) => () => void;

/**
 * A lazy signal is a signal that will only subscribe to the upstream when at least one subscriber
 * is attached. It will unsubscribe from the upstream when the last subscriber is removed.
 *
 * A lazy signal can possess a special value "NOT_AVAILABLE", accessible from the static property
 * {@link LazySignal.NOT_AVAILABLE}. This value is used to indicate that the value is not available
 * yet. This can happen when the signal is created without an initial value and the upstream has not
 * emitted a value yet.
 */
export class LazySignal<TData> extends Subscribable<TData> implements SignalLike<TData> {
  public readonly [isLazySignalSymbol] = true;
  public static isLazySignal(value: unknown): value is LazySignal<unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      Object.prototype.hasOwnProperty.call(value, isLazySignalSymbol)
    );
  }
  public static readonly NOT_AVAILABLE = Symbol("notAvailable");
  private readonly signal: Signal<TData>;
  private readonly setValue: Setter<TData>;
  private dataIsStale = true;
  private upstreamUnsubscribe: (() => void) | null = null;
  private subscribersCount = 0;
  private isSubscribedToUpstream = false;
  private hasEncounteredError = false;

  /**
   * A signal that contains the current error.
   */
  public readonly errorSignal: Signal<Error | null>;
  private readonly setError: Setter<Error | null>;
  /**
   * This event will be triggered even if the value did not change. This is for resolving .pull.
   */
  private readonly updateReceivedEvent: SyncEvent<void>;
  private readonly emitUpdateReceivedEvent: () => void;
  private readonly updateReceivedSynchronousCallbacks = new Set<() => void>();

  public static create<TData>(
    initialValue: TData,
    subscribeUpstream: SubscribeUpstream<TData>,
    equalsPredicate: (a: TData, b: TData) => boolean = (a, b) => a === b,
  ) {
    return new LazySignal(initialValue, subscribeUpstream, equalsPredicate);
  }

  public static createWithoutInitialValue<TData>(
    subscribeUpstream: SubscribeUpstream<TData>,
    equalsPredicate: (a: TData, b: TData) => boolean = (a, b) => a === b,
  ): LazySignal<TData | NotAvailable> {
    const fullEqualsPredicate = (a: TData | NotAvailable, b: TData | NotAvailable) => {
      if (a === LazySignal.NOT_AVAILABLE || b === LazySignal.NOT_AVAILABLE) {
        return a === b;
      }
      return equalsPredicate(a, b);
    };
    return new LazySignal<TData | NotAvailable>(
      LazySignal.NOT_AVAILABLE,
      subscribeUpstream as any,
      fullEqualsPredicate,
    );
  }

  public static deriveFrom<TSource extends Array<unknown>, TData>(
    sourceSignals: { [TKey in keyof TSource]: SignalLike<TSource[TKey]> },
    deriver: (
      ...sourceValues: {
        [TKey in keyof TSource]: StripNotAvailable<TSource[TKey]>;
      }
    ) => TData,
    outputEqualsPredicate?: (a: TData, b: TData) => boolean,
  ): LazySignal<
    TSource extends Array<infer RElement>
      ? RElement extends NotAvailable
        ? TData | NotAvailable
        : TData
      : never
  > {
    let fullEqualsPredicate:
      | ((a: TData | NotAvailable, b: TData | NotAvailable) => boolean)
      | undefined = undefined;
    if (outputEqualsPredicate !== undefined) {
      fullEqualsPredicate = (a, b) => {
        if (a === LazySignal.NOT_AVAILABLE || b === LazySignal.NOT_AVAILABLE) {
          return a === b;
        }
        return outputEqualsPredicate(a, b);
      };
    }
    const derive = () => {
      const sourceValues = sourceSignals.map(signal => signal.get());
      if (sourceValues.some(value => value === LazySignal.NOT_AVAILABLE)) {
        return LazySignal.NOT_AVAILABLE;
      }
      return deriver(...(sourceValues as any));
    };
    return new LazySignal(
      derive(),
      setDownstream => {
        const unsubscriber = sourceSignals.map(signal =>
          signal.subscribe(() => {
            const value = derive();
            if (isAvailable(value)) {
              setDownstream(value);
            }
          }),
        );
        const newValue = derive();
        if (isAvailable(newValue)) {
          setDownstream(newValue);
        }
        return () => {
          unsubscriber.forEach(unsub => unsub());
        };
      },
      fullEqualsPredicate,
    ) as any;
  }

  public static asyncDeriveFrom<TSource extends Array<unknown>, TData>(
    strategy: AsyncDeriveFromStrategy,
    sourceSignals: { [TKey in keyof TSource]: SignalLike<TSource[TKey]> },
    deriver: (
      ...sourceValues: {
        [TKey in keyof TSource]: StripNotAvailable<TSource[TKey]>;
      }
    ) => Promise<TData>,
    outputEqualsPredicate?: (a: TData, b: TData) => boolean,
  ): LazySignal<TData | NotAvailable> {
    let fullEqualsPredicate:
      | ((a: TData | NotAvailable, b: TData | NotAvailable) => boolean)
      | undefined = undefined;
    if (outputEqualsPredicate !== undefined) {
      fullEqualsPredicate = (a, b) => {
        if (a === LazySignal.NOT_AVAILABLE || b === LazySignal.NOT_AVAILABLE) {
          return a === b;
        }
        return outputEqualsPredicate(a, b);
      };
    }
    let lastAppliedUpdateId = -1;
    let lastIssuedUpdateId = -1;
    return new LazySignal<TData | NotAvailable>(
      LazySignal.NOT_AVAILABLE,
      setDownstream => {
        const deriveAndUpdate = () => {
          lastIssuedUpdateId++;
          const updateId = lastIssuedUpdateId;
          const sourceValues = sourceSignals.map(signal => signal.get());
          if (sourceValues.some(value => value === LazySignal.NOT_AVAILABLE)) {
            return;
          }
          deriver(...(sourceValues as any)).then(result => {
            if (!isAvailable(result)) {
              return;
            }
            switch (strategy) {
              case "eager": {
                if (updateId > lastAppliedUpdateId) {
                  lastAppliedUpdateId = updateId;
                  setDownstream(result);
                }
                break;
              }
              default: {
                const exhaustiveCheck: never = strategy;
                throw new Error(`Unknown strategy: ${exhaustiveCheck}`);
              }
            }
          });
        };
        const unsubscriber = sourceSignals.map(signal =>
          signal.subscribe(() => {
            deriveAndUpdate();
          }),
        );
        deriveAndUpdate();
        return () => {
          unsubscriber.forEach(unsub => unsub());
        };
      },
      fullEqualsPredicate,
    );
  }

  protected constructor(
    initialValue: TData,
    private readonly subscribeUpstream: SubscribeUpstream<TData>,
    equalsPredicate: (a: TData, b: TData) => boolean = (a, b) => a === b,
  ) {
    super();
    // Initialize with dummy values, will be set by resetErrorPromise
    [this.signal, this.setValue] = Signal.create<TData>(initialValue, equalsPredicate) as any;
    [this.updateReceivedEvent, this.emitUpdateReceivedEvent] = SyncEvent.create();
    [this.errorSignal, this.setError] = Signal.create<Error | null>(null);
  }

  /**
   * Returns whether the value is currently stale.
   *
   * A value is stale whenever the upstream subscription is not active. This can happen in three
   * cases:
   *
   * 1. When no subscriber is attached to this signal, the signal will not subscribe to the
   *    upstream. In this case, the value is always stale.
   * 2. When a subscriber is attached, but the upstream has not yet emitted a single value, the
   *    value is also stale.
   * 3. When the upstream has emitted an error. In this case, the subscription to the upstream is
   *    terminated and the value is stale.
   *
   * If you wish to get the current value and ensure that it is not stale, use the method
   * {@link LazySignal#pull}.
   */
  public isStale() {
    return this.dataIsStale;
  }

  /**
   * Returns whether the signal has encountered an error.
   * A signal in error state will not attempt to reconnect to upstream
   * until `recoverFromError()` is called.
   */
  public hasError(): boolean {
    return this.hasEncounteredError;
  }

  /**
   * Attempts to recover from an error state. If the signal has encountered an error, this method
   * will:
   * 1. Clear the error state
   * 2. Mark data as stale
   * 3. Reset the error promise so future errors can be caught
   * 4. If there are active subscribers, immediately attempt to resubscribe to upstream
   *
   * This is useful for recovering from transport-level errors when a connection is re-established.
   *
   * @returns true if recovery was attempted (signal was in error state), false otherwise
   */
  public recoverFromError(): boolean {
    if (!this.hasEncounteredError) {
      return false;
    }

    this.hasEncounteredError = false;
    this.dataIsStale = true;
    this.setError(null);

    // If we have subscribers, immediately try to reconnect
    if (this.subscribersCount > 0) {
      this.subscribeToUpstream();
    }

    return true;
  }

  private subscribeToUpstream() {
    if (this.hasEncounteredError) {
      return;
    }
    this.isSubscribedToUpstream = true;
    let subscribed = true;
    let becameStale = false;
    const unsubscribeFromUpstream = this.subscribeUpstream(
      makeSetterWithPatches((updater, tags) => {
        if (!subscribed) {
          return;
        }
        this.setValue.withPatchUpdater(updater, tags);
        this.dataIsStale = becameStale;
        this.emitUpdateReceivedEvent();
        for (const callback of this.updateReceivedSynchronousCallbacks) {
          callback();
        }
      }),
      error => {
        if (!subscribed) {
          return;
        }
        const normalizedError =
          error instanceof Error
            ? error
            : new Error(error === undefined ? "Unknown error" : String(error));
        if (!this.hasEncounteredError) {
          this.hasEncounteredError = true;
          this.setError(normalizedError);
        }
        this.dataIsStale = true;
        this.isSubscribedToUpstream = false;
        this.upstreamUnsubscribe = null;
        becameStale = true;
        subscribed = false;
      },
    );
    this.upstreamUnsubscribe = () => {
      if (subscribed) {
        subscribed = false;
        becameStale = true;
        unsubscribeFromUpstream();
      }
    };
  }

  private unsubscribeFromUpstream() {
    this.isSubscribedToUpstream = false;
    if (this.upstreamUnsubscribe !== null) {
      this.upstreamUnsubscribe();
      this.upstreamUnsubscribe = null;
      this.dataIsStale = true;
    }
  }

  /**
   * Gets the current value of the signal. If the value is not available, it will return
   * {@link LazySignal.NOT_AVAILABLE}. (A value will only be unavailable if the signal is created
   * without an initial value and the upstream has not emitted a value yet.)
   *
   * In addition, the value returned by this method may be stale. Use {@link LazySignal#isStale} to
   * check if the value is stale.
   *
   * If you wish to get the current value and ensure that it is not stale, use the method
   * {@link LazySignal#pull}.
   */
  public get(): TData {
    return this.signal.get();
  }

  /**
   * Pulls the current value of the signal. If the value is stale, it will subscribe and wait for
   * the next value from the upstream and return it.
   */
  public async pull(): Promise<StripNotAvailable<TData>> {
    const { promise, resolve } = makePromise<StripNotAvailable<TData>>();
    if (!this.isStale()) {
      // If not stale, definitely not "NOT_AVAILABLE"
      resolve(this.get() as StripNotAvailable<TData>);
    } else {
      // Register event listener BEFORE subscribe() because subscribe() may trigger
      // subscribeToUpstream() which can emit the event synchronously
      this.updateReceivedEvent.subscribeOnce(() => {
        resolve(this.get() as StripNotAvailable<TData>);
      });
      const unsubscribe = this.subscribe(() => {});
      promise.then(unsubscribe);
    }
    return promise;
  }

  /**
   * If the data is not stale, the callback will be called synchronously with the current value.
   *
   * If the data is stale, it will pull the current value and call the callback with the value.
   */
  public runOnNextFreshData(callback: (value: StripNotAvailable<TData>) => void) {
    if (!this.isStale()) {
      callback(this.get() as StripNotAvailable<TData>);
    } else {
      let unsubscribe: (() => void) | null = null;
      const updateCallback = () => {
        this.updateReceivedSynchronousCallbacks.delete(updateCallback);
        callback(this.get() as StripNotAvailable<TData>);
        unsubscribe?.();
      };
      this.updateReceivedSynchronousCallbacks.add(updateCallback);
      unsubscribe = this.subscribe(() => {});
    }
  }

  public async ensureAvailable(): Promise<LazySignal<StripNotAvailable<TData>>> {
    await this.pull();
    return this as any;
  }

  public subscribe(subscriber: Subscriber<TData>): () => void {
    if (!this.isSubscribedToUpstream && !this.hasEncounteredError) {
      this.subscribeToUpstream();
    }
    this.subscribersCount++;
    const unsubscribe = this.signal.subscribe(subscriber);
    let unsubscribeCalled = false;
    return () => {
      if (unsubscribeCalled) {
        return;
      }
      unsubscribe();
      unsubscribeCalled = true;
      this.subscribersCount--;
      if (this.subscribersCount === 0 && this.isSubscribedToUpstream) {
        this.unsubscribeFromUpstream();
      }
    };
  }

  public subscribeFull(subscriber: SignalFullSubscriber<TData>): () => void {
    if (!this.isSubscribedToUpstream && !this.hasEncounteredError) {
      this.subscribeToUpstream();
    }
    this.subscribersCount++;
    const unsubscribe = this.signal.subscribeFull(subscriber);
    let unsubscribeCalled = false;
    return () => {
      if (unsubscribeCalled) {
        return;
      }
      unsubscribe();
      unsubscribeCalled = true;
      this.subscribersCount--;
      if (this.subscribersCount === 0 && this.isSubscribedToUpstream) {
        this.unsubscribeFromUpstream();
      }
    };
  }

  /**
   * Subscribes to the signal. Will not cause the signal to subscribe to the upstream.
   */
  public passiveSubscribe(subscriber: Subscriber<TData>): () => void {
    return this.signal.subscribe(subscriber);
  }

  public passiveSubscribeFull(subscriber: SignalFullSubscriber<TData>): () => void {
    return this.signal.subscribeFull(subscriber);
  }

  public async until(
    predicate: (data: StripNotAvailable<TData>) => boolean,
  ): Promise<StripNotAvailable<TData>> {
    const current = this.get();
    if (isAvailable(current) && predicate(current)) {
      return current;
    }
    const { promise, resolve } = makePromise<StripNotAvailable<TData>>();
    const unsubscribe = this.subscribe(data => {
      if (isAvailable(data) && predicate(data)) {
        resolve(data as StripNotAvailable<TData>);
        unsubscribe();
      }
    });
    return await promise;
  }
}
