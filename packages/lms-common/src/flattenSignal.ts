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
  return LazySignal.createWithoutInitialValue<TInner>(
    (setDownstream, _errorListener, markDownstreamStale) => {
      let unsubscribeInnerSignal: (() => void) | null = null;
      let unsubscribeInnerStaleSignal: (() => void) | null = null;

      /** Stops listening to the previously selected inner signal. */
      const unsubscribeInner = () => {
        unsubscribeInnerStaleSignal?.();
        unsubscribeInnerStaleSignal = null;
        unsubscribeInnerSignal?.();
        unsubscribeInnerSignal = null;
      };

      /** Selects the current inner signal once both levels are fresh. */
      const subscribeToInnerSignal = (
        maybeInnerSignal: SignalLike<TInner | NotAvailable> | NotAvailable,
      ) => {
        unsubscribeInner();
        if (!isAvailable(maybeInnerSignal)) {
          markDownstreamStale();
          return;
        }

        /** Applies an inner update only when both levels say its value is fresh. */
        const updateFromInner = (
          value: TInner | NotAvailable,
          patches?: Array<Patch>,
          tags?: Array<WriteTag>,
          isFresh = maybeInnerSignal.staleSignal?.get() !== true,
        ) => {
          if (rootSignal.staleSignal?.get() === true || !isFresh) {
            markDownstreamStale();
            return;
          }
          if (!isAvailable(value)) {
            markDownstreamStale();
          } else if (patches === undefined) {
            setDownstream(value, tags);
          } else {
            setDownstream.withValueAndPatches(value, patches, tags);
          }
        };

        unsubscribeInnerSignal =
          maybeInnerSignal.subscribeFullWithFreshness?.(updateFromInner) ??
          maybeInnerSignal.subscribeFull(updateFromInner);
        unsubscribeInnerStaleSignal =
          maybeInnerSignal.staleSignal?.subscribe(isStale => {
            if (isStale) {
              markDownstreamStale();
            } else {
              updateFromInner(maybeInnerSignal.get());
            }
          }) ?? null;
        updateFromInner(maybeInnerSignal.get());
      };

      /** Rechecks the root after value and freshness changes. */
      const updateFromRoot = () => {
        if (rootSignal.staleSignal?.get() === true) {
          markDownstreamStale();
        } else {
          subscribeToInnerSignal(rootSignal.get());
        }
      };

      const unsubscribeRootSignal = rootSignal.subscribe(updateFromRoot);
      const unsubscribeRootStaleSignal = rootSignal.staleSignal?.subscribe(isStale => {
        if (isStale) {
          markDownstreamStale();
        } else {
          updateFromRoot();
        }
      });
      updateFromRoot();

      return () => {
        unsubscribeInner();
        unsubscribeRootStaleSignal?.();
        unsubscribeRootSignal();
      };
    },
  );
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
  signal = LazySignal.createWithoutInitialValue<TInner>(
    (setDownstream, _errorListener, markDownstreamStale) => {
      let unsubscribeInnerSignal: (() => void) | null = null;
      let unsubscribeInnerStaleSignal: (() => void) | null = null;

      /** Stops writes and updates from the previously selected inner signal. */
      const unsubscribeInner = () => {
        unsubscribeInnerStaleSignal?.();
        unsubscribeInnerStaleSignal = null;
        unsubscribeInnerSignal?.();
        unsubscribeInnerSignal = null;
        innerSetter = null;
      };

      /** Selects the current writable signal once both levels are fresh. */
      const subscribeToInnerSignal = (
        maybeInnerSignal:
          | readonly [signal: SignalLike<TInner | NotAvailable>, setter: Setter<TInner>]
          | NotAvailable,
      ) => {
        unsubscribeInner();
        if (!isAvailable(maybeInnerSignal)) {
          markDownstreamStale();
          return;
        }

        /** Applies an inner update only when both levels say its value is fresh. */
        const maybeUpdateDownstream = (
          value: TInner | NotAvailable,
          patches?: Array<Patch>,
          tags?: Array<WriteTag>,
          isFresh = maybeInnerSignal[0].staleSignal?.get() !== true,
        ) => {
          if (rootSignal.staleSignal?.get() === true || !isFresh || !isAvailable(value)) {
            innerSetter = null;
            markDownstreamStale();
            return;
          }
          if (patches !== undefined) {
            setDownstream.withValueAndPatches(value, patches, tags);
          } else {
            setDownstream(value, tags);
          }
          const setter = maybeInnerSignal[1];

          // Apply writes that arrived while the selected signal was stale or unavailable.
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

        unsubscribeInnerSignal =
          maybeInnerSignal[0].subscribeFullWithFreshness?.(maybeUpdateDownstream) ??
          maybeInnerSignal[0].subscribeFull(maybeUpdateDownstream);
        unsubscribeInnerStaleSignal =
          maybeInnerSignal[0].staleSignal?.subscribe(isStale => {
            if (isStale) {
              innerSetter = null;
              markDownstreamStale();
            } else {
              maybeUpdateDownstream(maybeInnerSignal[0].get());
            }
          }) ?? null;
        maybeUpdateDownstream(maybeInnerSignal[0].get());
      };

      /** Rechecks the root after value and freshness changes. */
      const updateFromRoot = () => {
        if (rootSignal.staleSignal?.get() === true) {
          innerSetter = null;
          markDownstreamStale();
        } else {
          subscribeToInnerSignal(rootSignal.get());
        }
      };

      const unsubscribeRootSignal = rootSignal.subscribe(updateFromRoot);
      const unsubscribeRootStaleSignal = rootSignal.staleSignal?.subscribe(isStale => {
        if (isStale) {
          innerSetter = null;
          markDownstreamStale();
        } else {
          updateFromRoot();
        }
      });
      updateFromRoot();

      return () => {
        unsubscribeInner();
        unsubscribeRootStaleSignal?.();
        unsubscribeRootSignal();
      };
    },
  );
  return [signal, setter] as const;
}
