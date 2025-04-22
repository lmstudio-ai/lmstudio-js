export function promisifyAbortSignal(abortSignal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (abortSignal.aborted) {
      reject(abortSignal.reason);
      return;
    }
    abortSignal.addEventListener(
      "abort",
      () => {
        reject(abortSignal.reason);
      },
      { once: true },
    );
  });
}

export function raceWithAbortSignal<TResolve>(
  promise: Promise<TResolve>,
  abortSignal: AbortSignal,
): Promise<TResolve> {
  return Promise.race([promise, promisifyAbortSignal(abortSignal)]);
}
