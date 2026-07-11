import { type Patch } from "@lmstudio/immer-with-plugins";
import {
  isAvailable,
  LazySignal,
  type NotAvailable,
  type StripNotAvailable,
} from "./LazySignal.js";
import { makeSetterWithPatches, type Setter, type WriteTag } from "./makeSetter.js";
import { type SignalLike } from "./Signal.js";

function isReplaceRootPatch(patch: Patch): boolean {
  return patch.op === "replace" && patch.path.length === 0;
}

/**
 * Flatten a signal of signals into a single signal.
 */
export function flattenSignalOfSignal<TInner>(
  rootSignal: SignalLike<SignalLike<TInner | NotAvailable> | NotAvailable>,
): LazySignal<TInner | NotAvailable> {
  return LazySignal.createWithoutInitialValue<TInner>(setDownstream => {
    let unsubscribeInnerSignal: (() => void) | null = null;
    let cancelInnerFreshnessWait: (() => void) | null = null;
    const subscribeToInnerSignal = (
      maybeInnerSignal: SignalLike<TInner | NotAvailable> | NotAvailable,
    ) => {
      if (!isAvailable(maybeInnerSignal)) {
        return;
      }
      cancelInnerFreshnessWait?.();
      cancelInnerFreshnessWait = null;
      unsubscribeInnerSignal?.();
      let updateReceived = false;
      unsubscribeInnerSignal = maybeInnerSignal.subscribeFull((value, patches, tags) => {
        updateReceived = true;
        if (!isAvailable(value)) {
          return;
        }
        setDownstream.withValueAndPatches(value, patches, tags);
      });
      if (LazySignal.isLazySignal(maybeInnerSignal) && maybeInnerSignal.isStale()) {
        cancelInnerFreshnessWait = maybeInnerSignal.runOnNextFreshData(value => {
          if (!updateReceived && isAvailable(value)) {
            setDownstream(value);
          }
        });
      } else {
        const currentValue = maybeInnerSignal.get();
        if (isAvailable(currentValue)) {
          setDownstream(currentValue);
        }
      }
    };
    let rootUpdateReceived = false;
    const unsubscribeRootSignal = rootSignal.subscribe(value => {
      rootUpdateReceived = true;
      subscribeToInnerSignal(value);
    });
    let cancelRootFreshnessWait: (() => void) | null = null;
    if (LazySignal.isLazySignal(rootSignal) && rootSignal.isStale()) {
      cancelRootFreshnessWait = rootSignal.runOnNextFreshData(value => {
        if (!rootUpdateReceived) {
          subscribeToInnerSignal(value);
        }
      });
    } else {
      subscribeToInnerSignal(rootSignal.get());
    }
    return () => {
      cancelInnerFreshnessWait?.();
      unsubscribeInnerSignal?.();
      cancelRootFreshnessWait?.();
      unsubscribeRootSignal();
    };
  });
}

/**
 * Flatten a signal of writable signals into a single writable signal.
 */
export function flattenSignalOfWritableSignal<TInner>(
  rootSignal: SignalLike<
    readonly [signal: SignalLike<TInner | NotAvailable>, setter: Setter<TInner>] | NotAvailable
  >,
): readonly [signal: LazySignal<TInner | NotAvailable>, setter: Setter<TInner>] {
  // eslint-disable-next-line prefer-const
  let signal: LazySignal<TInner | NotAvailable>;
  let queuedUpdates: Array<{
    updater: (oldValue: TInner) => readonly [newValue: TInner, patches: Array<Patch>];
    tags: Array<WriteTag> | undefined;
  }> = [];
  let innerSetter: Setter<TInner> | null = null;
  const setter = makeSetterWithPatches<TInner>((updater, tags) => {
    if (innerSetter !== null) {
      // If currently there is an inner setter, apply the update immediately
      innerSetter.withPatchUpdater(updater, tags);
    } else {
      // Otherwise, queue the update. Pull the signal to apply the update. (Application of queued
      // updates is done in the inner subscription)
      queuedUpdates.push({ updater, tags });
      signal.pull().catch(console.error);
    }
  });
  signal = LazySignal.createWithoutInitialValue<TInner>(setDownstream => {
    let unsubscribeInnerSignal: (() => void) | null = null;
    let cancelInnerFreshnessWait: (() => void) | null = null;
    const subscribeToInnerSignal = (
      maybeInnerSignal:
        | readonly [signal: SignalLike<TInner | NotAvailable>, setter: Setter<TInner>]
        | NotAvailable,
    ) => {
      if (!isAvailable(maybeInnerSignal)) {
        return;
      }
      cancelInnerFreshnessWait?.();
      cancelInnerFreshnessWait = null;
      unsubscribeInnerSignal?.();
      innerSetter = null;
      const maybeUpdateDownstream = (
        value: TInner | NotAvailable,
        patches?: Array<Patch>,
        tags?: Array<WriteTag>,
      ) => {
        if (!isAvailable(value)) {
          return;
        }
        if (patches !== undefined) {
          setDownstream.withValueAndPatches(value, patches, tags);
        } else {
          setDownstream(value, tags);
        }
        const setter = maybeInnerSignal[1];

        // Apply queued updates
        if (queuedUpdates.length !== 0) {
          const updatesToApply = queuedUpdates;
          queuedUpdates = [];
          let currentValue: TInner = value;
          let accumulatedPatches: Array<Patch> = [];
          const tags: Array<WriteTag> = [];
          for (const { updater, tags: newTags } of updatesToApply) {
            const [newValue, newPatches] = updater(currentValue);
            currentValue = newValue;
            const rootReplacerIndex = newPatches.findIndex(isReplaceRootPatch);
            if (rootReplacerIndex !== -1) {
              accumulatedPatches = newPatches.slice(rootReplacerIndex);
            } else {
              accumulatedPatches.push(...newPatches);
            }
            if (newTags !== undefined) {
              tags.push(...newTags);
            }
          }
          setter.withValueAndPatches(
            currentValue as StripNotAvailable<TInner>,
            accumulatedPatches,
            tags,
          );
        }
        innerSetter = setter;
      };
      let updateReceived = false;
      unsubscribeInnerSignal = maybeInnerSignal[0].subscribeFull((value, patches, tags) => {
        updateReceived = true;
        maybeUpdateDownstream(value, patches, tags);
      });
      if (LazySignal.isLazySignal(maybeInnerSignal[0]) && maybeInnerSignal[0].isStale()) {
        cancelInnerFreshnessWait = maybeInnerSignal[0].runOnNextFreshData(value => {
          if (!updateReceived) {
            maybeUpdateDownstream(value);
          }
        });
      } else {
        maybeUpdateDownstream(maybeInnerSignal[0].get());
      }
    };
    let rootUpdateReceived = false;
    const unsubscribeRootSignal = rootSignal.subscribe(value => {
      rootUpdateReceived = true;
      subscribeToInnerSignal(value);
    });
    let cancelRootFreshnessWait: (() => void) | null = null;
    if (LazySignal.isLazySignal(rootSignal) && rootSignal.isStale()) {
      cancelRootFreshnessWait = rootSignal.runOnNextFreshData(value => {
        if (!rootUpdateReceived) {
          subscribeToInnerSignal(value);
        }
      });
    } else {
      subscribeToInnerSignal(rootSignal.get());
    }
    return () => {
      cancelInnerFreshnessWait?.();
      unsubscribeInnerSignal?.();
      innerSetter = null;
      cancelRootFreshnessWait?.();
      unsubscribeRootSignal();
    };
  });
  return [signal, setter] as const;
}
