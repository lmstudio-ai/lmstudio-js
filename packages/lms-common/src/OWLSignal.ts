import { type Patch } from "@lmstudio/immer-with-plugins";
import { Event } from "./Event.js";
import {
  isAvailable,
  LazySignal,
  type NotAvailable,
  type StripNotAvailable,
  type SubscribeUpstream,
} from "./LazySignal.js";
import { makePromise } from "./makePromise.js";
import { makeSetterWithPatches, type Setter, type WriteTag } from "./makeSetter.js";
import { Signal, type SignalFullSubscriber, type SignalLike, type Subscriber } from "./Signal.js";
import { Subscribable } from "./Subscribable.js";

interface WriteError {
  tags: Array<WriteTag>;
  error: any;
}

/**
 * OWLSignal - Optimistic Writable Lazy Signal
 *
 * - Signal: It is a signal, i.e. an observable that remembers its current value
 * - Lazy: It is lazy, i.e. it does not subscribe to the upstream until a subscriber is attached
 * - Writable: It is writable, i.e. it has a setter to update its value
 * - Optimistic: It is optimistic, i.e. it updates its value optimistically and then waits for the
 *   upstream to confirm the update
 *   - Once the setter is called, the value is updated optimistically and all subscribers are
 *     notified synchronously
 *
 * Guarantees:
 *
 * - The OWLSignal is designed for single-writer multiple-reader scenarios, as the coordination of
 *   writes are tracked inside the OWLSignal. If there are multiple writers for the same data (i.e.
 *   multiple OWLSignal backed by the same upstream), there are no strong guarantees. For example,
 *   two updaters may read the same value, update it, and write it back to the upstream, causing one
 *   of the updates to be lost. The following guarantees are provided for single-writer scenarios:
 * - The updates are applied in the order they are received, and each updater is guaranteed to see
 *   all updates that were applied before it.
 * - If there are updaters [u_0, u_1, ..., u_n], for any read-only reader, there exists a time t
 *   where the reader will see the updates [u_0, u_1, ..., u_t] in the order they were applied. This
 *   also applies to the writer itself.
 */
export class OWLSignal<TData> extends Subscribable<TData> implements SignalLike<TData> {
  public static readonly NOT_AVAILABLE: NotAvailable = LazySignal.NOT_AVAILABLE;
  /**
   * The inner signal used to subscribe to the upstream
   */
  private readonly innerSignal: LazySignal<TData>;
  /**
   * The outer signal used to notify subscribers of the value (after applying optimistic updates)
   */
  private readonly outerSignal: Signal<TData>;
  /**
   * The setter function to update the value of the signal.
   */
  private readonly setOuterSignal: Setter<TData>;
  private isWriteLoopRunning = false;
  /**
   * We have a passive subscription to the inner signal to update the optimistic value whenever the
   * inner signal changes.
   *
   * However, if the content changes are caused by a write, we want to update the inner value,
   * remove the optimistic update, and apply the remaining optimistic updates all at once.
   *
   * Therefore, when a write is ongoing, we set this flag to true to prevent the passive
   * subscription from updating the optimistic value. We will handle the updates within the write
   * loop.
   */
  private isSubscriptionHandledByWriteLoop = false;
  /**
   * A queue of updates to apply optimistically.
   */
  private queuedUpdates: Array<{
    updater: (
      oldValue: StripNotAvailable<TData>,
    ) => readonly [StripNotAvailable<TData>, Array<Patch>];
    tags: Array<WriteTag>;
    resolve: () => void;
    reject: (error: any) => void;
  }> = [];
  private writeErrorEvent: Event<WriteError>;
  private emitWriteErrorEvent: (writeError: WriteError) => void;

  private applyOptimisticUpdates(data: StripNotAvailable<TData>) {
    for (const update of this.queuedUpdates) {
      [data] = update.updater(data);
    }
    return data;
  }

  private updateOptimisticValue(tags?: Array<WriteTag>) {
    const innerValue = this.innerSignal.get();
    if (!isAvailable(innerValue)) {
      return;
    }
    this.setOuterSignal(this.applyOptimisticUpdates(innerValue), tags);
  }

  private constructor(
    initialValue: TData,
    subscribeUpstream: SubscribeUpstream<TData>,
    private readonly writeUpstream: (
      data: StripNotAvailable<TData>,
      patches: Array<Patch>,
      tags: Array<WriteTag>,
    ) => boolean,
    equalsPredicate: (a: TData, b: TData) => boolean,
  ) {
    super();
    [this.writeErrorEvent, this.emitWriteErrorEvent] = Event.create();
    [this.outerSignal, this.setOuterSignal] = Signal.create(initialValue, equalsPredicate);
    this.innerSignal = LazySignal.create(initialValue, subscribeUpstream, equalsPredicate);
    this.innerSignal.passiveSubscribeFull((_data, _patches, tags) => {
      if (this.isSubscriptionHandledByWriteLoop) {
        return;
      }
      this.updateOptimisticValue(tags);
    });
  }

  public static create<TData>(
    initialValue: TData,
    subscribeUpstream: SubscribeUpstream<TData>,
    /**
     * Returns true if the update is sent to the upstream (thus should wait for the upstream to
     * confirm. Returns false if the update is not sent and the update should be dropped.
     */
    writeUpstream: (
      data: StripNotAvailable<TData>,
      patches: Array<Patch>,
      tags: Array<WriteTag>,
    ) => boolean,
    equalsPredicate: (a: TData, b: TData) => boolean = (a, b) => a === b,
  ) {
    const signal = new OWLSignal(initialValue, subscribeUpstream, writeUpstream, equalsPredicate);
    const setSignal = makeSetterWithPatches<StripNotAvailable<TData>>(signal.update.bind(signal));
    const emitError = (tags: Array<WriteTag>, error: any) =>
      signal.emitWriteErrorEvent({ tags, error });
    return [signal, setSignal, emitError] as const;
  }

  public static createWithoutInitialValue<TData>(
    subscribeUpstream: SubscribeUpstream<TData | NotAvailable>,
    writeUpstream: (
      data: StripNotAvailable<TData>,
      patches: Array<Patch>,
      tags: Array<WriteTag>,
    ) => boolean,
    equalsPredicate: (a: TData, b: TData) => boolean = (a, b) => a === b,
  ) {
    const fullEqualsPredicate = (a: TData | NotAvailable, b: TData | NotAvailable) => {
      if (a === OWLSignal.NOT_AVAILABLE || b === OWLSignal.NOT_AVAILABLE) {
        return a === b;
      }
      return equalsPredicate(a, b);
    };
    return OWLSignal.create<TData | NotAvailable>(
      OWLSignal.NOT_AVAILABLE,
      subscribeUpstream,
      writeUpstream,
      fullEqualsPredicate,
    );
  }

  private async update(
    updater: (
      oldValue: StripNotAvailable<TData>,
    ) => readonly [StripNotAvailable<TData>, Array<Patch>],
    tags?: Array<WriteTag>,
  ) {
    const { promise, reject, resolve } = makePromise<void>();
    this.queuedUpdates.push({
      updater,
      tags: tags ?? [],
      resolve,
      reject,
    });
    this.updateOptimisticValue();
    this.ensureWriteLoop();
    // FIXME: Don't propagate errors here since setters cannot fail currently.
    return promise.catch(() => {});
  }
  /**
   * Starts the write loop if it is not already running.
   */
  private ensureWriteLoop() {
    if (!this.isWriteLoopRunning) {
      this.writeLoop(); // This is not expected to error, if it does, just default behavior
    }
  }
  /**
   * The main write loop, it will keep running until there are no more updates to process.
   */
  private async writeLoop() {
    const unsubscribe = this.innerSignal.subscribe(() => {});
    this.isWriteLoopRunning = true;
    try {
      if (this.isStale()) {
        await this.innerSignal.pull();
      }
      while (this.queuedUpdates.length > 0) {
        const numQueuedUpdatesToHandle = this.queuedUpdates.length;
        const updater = (data: StripNotAvailable<TData>) => {
          const patches: Array<Patch> = [];
          for (let i = 0; i < numQueuedUpdatesToHandle; i++) {
            const [newData, newPatches] = this.queuedUpdates[i].updater(data);
            data = newData;
            patches.push(...newPatches);
          }
          return [data, patches] as const;
        };
        const resolve = () => {
          for (let i = 0; i < numQueuedUpdatesToHandle; i++) {
            this.queuedUpdates[i].resolve();
          }
        };
        const reject = (error: any) => {
          for (let i = 0; i < numQueuedUpdatesToHandle; i++) {
            this.queuedUpdates[i].reject(error);
          }
        };
        const queuedUpdateTags = this.queuedUpdates.flatMap(update => update.tags);

        const tag = Date.now() + "-" + Math.random();

        await new Promise<void>(nextStep => {
          this.isSubscriptionHandledByWriteLoop = true;
          const unsubscribeArray: Array<() => void> = [];
          let settled = false;

          const settle = () => {
            if (settled) {
              return;
            }
            settled = true;
            this.isSubscriptionHandledByWriteLoop = false;
            unsubscribeArray.forEach(unsubscribe => unsubscribe());
            nextStep();
          };
          unsubscribeArray.push(
            this.innerSignal.subscribeFull((_data, _patches, tags) => {
              if (!this.isSubscriptionHandledByWriteLoop) {
                return;
              }
              if (tags?.includes(tag)) {
                settle();
                resolve();
                // If this update is caused by the write, we need to remove the optimistic update
                // and apply the remaining optimistic updates
                this.queuedUpdates.splice(0, numQueuedUpdatesToHandle);
                this.updateOptimisticValue(tags.filter(t => t !== tag));
              } else {
                // This update is not caused by the write, simply update the optimistic value
                // as normal
                this.updateOptimisticValue(tags);
              }
            }),
          );
          unsubscribeArray.push(
            this.writeErrorEvent.subscribe(({ tags, error }) => {
              if (!this.isSubscriptionHandledByWriteLoop) {
                return;
              }
              if (tags.includes(tag)) {
                settle();
                reject(error);
                this.queuedUpdates.splice(0, numQueuedUpdatesToHandle);
              }
            }),
          );

          // Listen for transport-level errors on the inner signal
          // This handles the case where the transport fails during an in-flight write
          unsubscribeArray.push(
            this.innerSignal.errorSignal.subscribe(error => {
              // Only act if we're still waiting (not settled yet) and an error occurred
              if (error !== null && !settled && this.isSubscriptionHandledByWriteLoop) {
                settle();
                reject(error);
                this.queuedUpdates.splice(0, numQueuedUpdatesToHandle);
              }
            }),
          );

          // At this point, we know the data is available, because upon entering the write loop, we
          // ensure that the data is available by pulling. Hence, we can safely cast the data to
          // StripNotAvailable<TData>.
          const sent = this.writeUpstream(
            ...updater(this.innerSignal.get() as StripNotAvailable<TData>),
            [tag, ...queuedUpdateTags],
          );
          if (!sent) {
            settle();
            resolve();
            this.queuedUpdates.splice(0, numQueuedUpdatesToHandle);
            this.updateOptimisticValue(queuedUpdateTags.filter(t => t !== tag));
          }
        });
      }
    } finally {
      this.isWriteLoopRunning = false;
      unsubscribe();
    }
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
   * {@link OWLSignal#pull}.
   */
  public isStale() {
    return this.innerSignal.isStale();
  }

  /**
   * Returns whether the inner signal has encountered an error. A signal in error state will not
   * attempt to reconnect to upstream until `recoverFromError()` is called.
   */
  public hasError(): boolean {
    return this.innerSignal.hasError();
  }

  /**
   * A signal that emits the current error (or null if no error). Delegates to the inner
   * LazySignal's error signal.
   */
  public get errorSignal(): Signal<Error | null> {
    return this.innerSignal.errorSignal;
  }

  /**
   * Attempts to recover from an error state by delegating to the inner LazySignal.
   *
   * @returns true if recovery was attempted (signal was in error state), false otherwise
   */
  public recoverFromError(): boolean {
    return this.innerSignal.recoverFromError();
  }

  /**
   * Gets the current value of the signal. If the value is not available, it will return
   * {@link OWLSignal.NOT_AVAILABLE}. (A value will only be unavailable if the signal is created
   * without an initial value and the upstream has not emitted a value yet.)
   *
   * In addition, the value returned by this method may be stale. Use {@link OWLSignal#isStale} to
   * check if the value is stale.
   *
   * If you wish to get the current value and ensure that it is not stale, use the method
   * {@link OWLSignal#pull}.
   */
  public get(): TData {
    return this.outerSignal.get();
  }

  /**
   * Gets the current value of the signal pessimistically. If the value is not available, it will
   * return {@link OWLSignal.NOT_AVAILABLE}. (A value will only be unavailable if the signal is
   * created without an initial value and the upstream has not emitted a value yet.)
   */
  public getPessimistic(): TData {
    return this.innerSignal.get();
  }

  /**
   * Pulls the current value of the signal. If the value is stale, it will subscribe and wait for
   * the next value from the upstream and return it.
   *
   * You must also provide an `optimistic` flag. If `optimistic` is true, the pending optimistic
   * updates will be applied to the value before returning it.
   */
  public async pull({ optimistic = true }: { optimistic?: boolean } = {}) {
    if (optimistic) {
      return this.applyOptimisticUpdates(await this.innerSignal.pull());
    } else {
      return this.innerSignal.pull();
    }
  }

  private currentEnsureAvailablePromise: Promise<OWLSignal<StripNotAvailable<TData>>> | null = null;
  public async ensureAvailable(): Promise<OWLSignal<StripNotAvailable<TData>>> {
    if (this.currentEnsureAvailablePromise === null) {
      this.currentEnsureAvailablePromise = (async () => {
        await this.innerSignal.pull();
        return this as OWLSignal<StripNotAvailable<TData>>;
      })();
    }
    return this.currentEnsureAvailablePromise;
  }

  public subscribe(subscriber: Subscriber<TData>) {
    const unsubscribeOuter = this.outerSignal.subscribe(subscriber);
    const unsubscribeInner = this.innerSignal.subscribe(() => {});
    return () => {
      unsubscribeOuter();
      unsubscribeInner();
    };
  }

  public subscribeFull(subscriber: SignalFullSubscriber<TData>): () => void {
    const unsubscribeOuter = this.outerSignal.subscribeFull(subscriber);
    const unsubscribeInner = this.innerSignal.subscribeFull(() => {});
    return () => {
      unsubscribeOuter();
      unsubscribeInner();
    };
  }
}
