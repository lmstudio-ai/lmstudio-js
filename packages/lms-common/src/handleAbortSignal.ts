const noop = () => {};

export function handleAbortSignal(abortSignal: AbortSignal | undefined, onAbort: () => void) {
  if (abortSignal === undefined) {
    return noop;
  }
  if (abortSignal.aborted) {
    onAbort();
    return noop;
  }
  let handled = false;
  abortSignal.addEventListener("abort", () => {
    if (handled) {
      return;
    }
    handled = true;
    onAbort();
  });
  return () => {
    handled = true;
  };
}
