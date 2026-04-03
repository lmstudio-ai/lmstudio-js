import { Event } from "./Event.js";
import { Subscribable } from "./Subscribable.js";

type Listener<TData> = (data: TData) => void;
const waitForNextMicroTask = Symbol();

export class BufferedEventOverflowError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BufferedEventOverflowError";
  }
}

interface BufferedEventCreateOpts {
  sizeLimit?: number;
  lengthLimit?: number;
}

export interface BufferedEventEmitter<TData> {
  (data: TData): void;
  emitWithSize(data: TData, size: number): void;
}

interface BufferedEventQueuedData<TData> {
  data: TData;
  size: number;
}
/**
 * A buffered event will buffer events in a queue if no subscribers are present. When a subscriber
 * is added, all buffered events will trigger sequentially in the next microtask.
 *
 * Similar to Event, events are always emitted during the next microtask.
 *
 * Attempting to add more than one subscriber will resulting in an error.
 */
export class BufferedEvent<TData> extends Subscribable<TData> {
  private subscriber: Listener<TData> | null = null;
  private queued: Array<BufferedEventQueuedData<TData> | typeof waitForNextMicroTask> = [];
  private queuedItemsCount = 0;
  private queuedSize = 0;
  private isNotifying = false;
  private overflowError: BufferedEventOverflowError | null = null;
  public static create<TData>(opts: BufferedEventCreateOpts = {}) {
    const event = new BufferedEvent<TData>(opts);
    const emitter = ((data: TData) => {
      event.emit(data);
    }) as BufferedEventEmitter<TData>;
    emitter.emitWithSize = (data: TData, size: number) => {
      event.emitWithSize(data, size);
    };
    return [event, emitter] as const;
  }
  private constructor(private readonly opts: BufferedEventCreateOpts) {
    super();
  }
  private emit(data: TData) {
    this.emitWithSize(data, 0);
  }
  private emitWithSize(data: TData, size: number) {
    if (this.overflowError !== null) {
      throw this.overflowError;
    }
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("BufferedEvent size must be a non-negative safe integer.");
    }
    if (this.queued.length === 0) {
      this.queued.push(waitForNextMicroTask);
    }
    this.queued.push({ data, size });
    this.queuedItemsCount += 1;
    this.queuedSize += size;

    const lengthLimit = this.opts.lengthLimit;
    const sizeLimit = this.opts.sizeLimit;
    let overflowError: BufferedEventOverflowError | null = null;
    if (
      lengthLimit !== undefined &&
      lengthLimit >= 0 &&
      this.queuedItemsCount > lengthLimit
    ) {
      overflowError = new BufferedEventOverflowError(
        `BufferedEvent exceeded lengthLimit (${lengthLimit}).`,
      );
    } else if (
      sizeLimit !== undefined &&
      sizeLimit >= 0 &&
      this.queuedSize > sizeLimit
    ) {
      overflowError = new BufferedEventOverflowError(
        `BufferedEvent exceeded sizeLimit (${sizeLimit} bytes).`,
      );
    }

    if (overflowError !== null) {
      this.overflowError = overflowError;
      this.queued = [];
      this.queuedItemsCount = 0;
      this.queuedSize = 0;
      throw overflowError;
    }
    if (!this.isNotifying) {
      this.notifier();
    }
  }
  private async notifier() {
    this.isNotifying = true;
    while (this.subscriber !== null && this.queued.length > 0) {
      const data = this.queued.shift()!;
      if (data === waitForNextMicroTask) {
        await Promise.resolve();
      } else {
        this.queuedItemsCount -= 1;
        this.queuedSize -= data.size;
        this.subscriber(data.data);
      }
    }
    this.isNotifying = false;
  }
  public subscribe(listener: Listener<TData>) {
    if (this.overflowError !== null) {
      throw this.overflowError;
    }
    if (this.subscriber !== null) {
      throw new Error("Cannot have more than one subscriber");
    }
    this.subscriber = listener;
    if (!this.isNotifying && this.queued.length > 0) {
      this.queued = [
        waitForNextMicroTask,
        ...this.queued.filter(data => data !== waitForNextMicroTask),
      ];
      this.notifier();
    }
    return () => {
      this.subscriber = null;
    };
  }
  /**
   * Convert this buffered event to an event by stop buffering and triggering events on the new
   * returned event.
   */
  public flow(): Event<TData> {
    const [event, emit] = Event.create<TData>();
    this.subscribe(emit);
    return event;
  }
}
