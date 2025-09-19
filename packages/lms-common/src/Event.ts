import { Subscribable } from "./Subscribable.js";

type Listener<TData> = (data: TData) => void;

interface EventBatchingOpts {
  minIdleTimeMs?: number;
  maxBatchTimeMs?: number;
}

/**
 * Represents an event that can be subscribed to. Emitted events will trigger all subscribers in the
 * next microtask. If multiple events are emitted, they will be triggered in the same microtask.
 */
export class Event<TData> extends Subscribable<TData> {
  private subscribers = new Set<Listener<TData>>();
  /**
   * Internal callback that is called when the number of subscribers goes from 0 to 1.
   */
  private onSubscribed: (() => void) | null = null;
  /**
   * Internal callback that is called when the number of subscribers goes from 1 to 0.
   */
  private onUnsubscribed: (() => void) | null = null;
  /**
   * Internal state that tracks whether the event has any subscribers.
   */
  protected constructor() {
    super();
  }
  protected emit(data: TData) {
    queueMicrotask(() => {
      for (const subscriber of this.subscribers) {
        subscriber(data);
      }
    });
  }
  public static create<TData>() {
    const event = new Event<TData>();
    const emitter: (data: TData) => void = data => {
      event.emit(data);
    };
    return [event, emitter] as const;
  }
  public subscribe(listener: Listener<TData>) {
    const previousSize = this.subscribers.size;
    this.subscribers.add(listener);
    if (previousSize === 0 && this.subscribers.size === 1) {
      this.onSubscribed?.();
    }
    return () => {
      const previousSize = this.subscribers.size;
      this.subscribers.delete(listener);
      if (previousSize === 1 && this.subscribers.size === 0) {
        this.onUnsubscribed?.();
      }
    };
  }
  public map<TOutput>(mapper: (data: TData) => TOutput): Event<TOutput> {
    const [mappedEvent, emitMapped] = Event.create<TOutput>();
    mappedEvent.onSubscribed = () => {
      mappedEvent.onUnsubscribed = this.subscribe(data => {
        const mapped = mapper(data);
        emitMapped(mapped);
      });
    };
    return mappedEvent;
  }
  public batch({
    minIdleTimeMs = 200,
    maxBatchTimeMs = 1000,
  }: EventBatchingOpts): Event<Array<TData>> {
    const [batchedEvent, emitBatchedEvent] = Event.create<Array<TData>>();
    batchedEvent.onSubscribed = () => {
      let batch: Array<TData> = [];
      let emitBatchTimeout: NodeJS.Timeout | null = null;
      let firstEventTime = 0;
      const emitBatch = () => {
        emitBatchTimeout = null;
        emitBatchedEvent(batch);
        batch = [];
      };
      batchedEvent.onUnsubscribed = this.subscribe(data => {
        batch.push(data);
        if (emitBatchTimeout === null) {
          // No scheduled batch
          firstEventTime = Date.now();
          emitBatchTimeout = setTimeout(emitBatch, Math.min(minIdleTimeMs, maxBatchTimeMs));
        } else {
          // Reschedule emission
          clearTimeout(emitBatchTimeout);
          const timeSinceFirstEvent = Date.now() - firstEventTime;
          emitBatchTimeout = setTimeout(
            emitBatch,
            Math.min(minIdleTimeMs, Math.max(0, maxBatchTimeMs - timeSinceFirstEvent)),
          );
        }
      });
    };
    return batchedEvent;
  }
}
