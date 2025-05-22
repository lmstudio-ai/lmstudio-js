import { Subscribable } from "./Subscribable.js";

export class CancelEvent extends Subscribable<void> {
  private canceled = false;
  private readonly listeners = new Set<() => void>();
  public override subscribe(listener: () => void): () => void {
    if (this.canceled) {
      let callbackCanceled = false;
      Promise.resolve().then(() => {
        if (!callbackCanceled) {
          listener();
        }
      });
      return () => {
        callbackCanceled = true;
      };
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  public cancel() {
    if (this.canceled) {
      throw new Error("Already canceled");
    }
    this.canceled = true;
    for (const listener of this.listeners) {
      listener();
    }
  }
  public isCanceled() {
    return this.canceled;
  }
}
