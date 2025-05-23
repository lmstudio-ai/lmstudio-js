import { Subscribable } from "./Subscribable.js";

type Listener<TData> = (data: TData) => void;

export class SyncEvent<TData> extends Subscribable<TData> {
  private subscribers = new Set<Listener<TData>>();
  protected constructor() {
    super();
  }
  protected emit(data: TData) {
    for (const subscriber of this.subscribers) {
      subscriber(data);
    }
  }
  public static create<TData>() {
    const event = new SyncEvent<TData>();
    const emitter: (data: TData) => void = data => {
      event.emit(data);
    };
    return [event, emitter] as const;
  }
  public subscribe(listener: Listener<TData>) {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener)
    };
  }
}
