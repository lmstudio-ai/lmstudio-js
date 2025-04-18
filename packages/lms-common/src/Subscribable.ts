import { type Cleaner } from "./Cleaner.js";
import {
  isAvailable,
  LazySignal,
  type NotAvailable,
  type StripNotAvailable,
} from "./LazySignal.js";
import { type SignalLike } from "./Signal.js";

function isSignalLike<TValue>(value: Subscribable<TValue>): value is SignalLike<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).get === "function" &&
    typeof (value as any).subscribe === "function"
  );
}

/**
 * Base class for objects that can be subscribed to. Provides common utility methods.
 */
export abstract class Subscribable<TData> {
  public abstract subscribe(listener: (data: TData) => void): () => void;

  public subscribeWithCleaner(cleaner: Cleaner, listener: (data: TData) => void) {
    const unsubscribe = this.subscribe(listener);
    cleaner.register(unsubscribe);
  }

  public subscribeOnce(listener: (data: TData) => void): () => void {
    const unsubscribe = this.subscribe(data => {
      unsubscribe();
      listener(data);
    });
    return unsubscribe;
  }

  public subscribeOnceWithCleaner(cleaner: Cleaner, listener: (data: TData) => void) {
    const unsubscribe = this.subscribeOnce(listener);
    cleaner.register(unsubscribe);
  }

  public derive<TOutput>(
    deriver: (data: StripNotAvailable<TData>) => StripNotAvailable<TOutput>,
    outputEqualsPredicate: (a: TOutput, b: TOutput) => boolean = (a, b) => a === b,
  ): typeof this extends { get(): TData }
    ? TOutput extends NotAvailable
      ? LazySignal<TOutput | NotAvailable>
      : LazySignal<TOutput>
    : LazySignal<TOutput | NotAvailable> {
    if (isSignalLike(this)) {
      return LazySignal.deriveFrom([this], deriver) as any;
    }
    const thisWithGetter = this as Subscribable<TData> & { get?(): TData };
    if (thisWithGetter.get !== undefined) {
      const initialValue = thisWithGetter.get();
      if (initialValue === LazySignal.NOT_AVAILABLE) {
        return LazySignal.createWithoutInitialValue(setDownstream => {
          return thisWithGetter.subscribe(data => {
            if (isAvailable(data)) {
              setDownstream(deriver(data));
            }
          });
        }) as any;
      }
      const thisNarrowed = thisWithGetter as Subscribable<StripNotAvailable<TData>> & {
        get(): StripNotAvailable<TData>;
      };
      return LazySignal.create<TOutput>(
        deriver(thisNarrowed.get()),
        setDownstream => {
          return thisNarrowed.subscribe(data => {
            setDownstream(deriver(data));
          });
        },
        outputEqualsPredicate,
      ) as any;
    }
    return LazySignal.createWithoutInitialValue(setDownstream => {
      return this.subscribe(data => {
        if (isAvailable(data)) {
          setDownstream(deriver(data));
        }
      });
    }, outputEqualsPredicate) as any;
  }
}
