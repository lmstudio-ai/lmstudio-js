import { handleAbortSignal } from "./handleAbortSignal.js";

describe("handleAbortSignal", () => {
  it("returns undefined and does not call onAbort when signal is undefined", () => {
    const onAbortHandler = jest.fn();

    const handleAbortSignalCleanup = handleAbortSignal(undefined, onAbortHandler);

    expect(handleAbortSignalCleanup).toBeDefined();
    expect(onAbortHandler).not.toHaveBeenCalled();
  });

  it("invokes onAbort immediately when signal is already aborted", () => {
    const abortController = new AbortController();
    abortController.abort();
    const onAbortHandler = jest.fn();

    const handleAbortSignalCleanup = handleAbortSignal(abortController.signal, onAbortHandler);

    expect(handleAbortSignalCleanup).toBeDefined();
    expect(onAbortHandler).toHaveBeenCalledTimes(1);
  });

  it("invokes onAbort once when signal aborts", () => {
    const abortController = new AbortController();
    const onAbortHandler = jest.fn();

    const handleAbortSignalCleanup = handleAbortSignal(abortController.signal, onAbortHandler);
    expect(handleAbortSignalCleanup).toBeDefined();

    abortController.abort();

    expect(onAbortHandler).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onAbort when cleanup is called before abort", () => {
    const abortController = new AbortController();
    const onAbortHandler = jest.fn();

    const handleAbortSignalCleanup = handleAbortSignal(abortController.signal, onAbortHandler);
    expect(handleAbortSignalCleanup).toBeDefined();

    if (handleAbortSignalCleanup !== undefined) {
      handleAbortSignalCleanup();
    }

    abortController.abort();

    expect(onAbortHandler).not.toHaveBeenCalled();
  });
});
