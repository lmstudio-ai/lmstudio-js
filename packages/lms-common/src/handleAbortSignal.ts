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
  const abortHandler = () => {
    if (handled) {
      return;
    }
    handled = true;
    onAbort();
  };
  abortSignal.addEventListener("abort", abortHandler, { once: true });
  return () => {
    handled = true;
    abortSignal.removeEventListener("abort", abortHandler);
  };
}
