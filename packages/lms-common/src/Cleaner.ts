export class Cleaner {
  private eagerCleaned = false;
  private readonly disposed = false;
  private readonly cleanups: Array<() => void> = [];
  public register(fn: () => void) {
    if (this.eagerCleaned) {
      throw new Error("Cannot register a cleanup after eagerClean() was called.");
    }
    if (this.disposed) {
      throw new Error("Cannot register a cleanup after the Cleaner was disposed.");
    }
    this.cleanups.push(fn);
  }
  private runCleanersInternal() {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    // Just to free some memory because why not
    this.cleanups.length = 0;
  }
  public [Symbol.dispose]() {
    if (this.eagerCleaned) {
      // Already eagerly cleaned. Nothing to do.
      return;
    }
    if (this.disposed) {
      throw new Error("Cannot dispose a Cleaner that was already disposed.");
    }
    this.runCleanersInternal();
  }
  public eagerClean() {
    if (this.eagerCleaned) {
      throw new Error("Cannot call eagerClean() twice.");
    }
    if (this.disposed) {
      throw new Error("Cannot call eagerClean() after the Cleaner was disposed.");
    }
    this.eagerCleaned = true;
    this.runCleanersInternal();
  }
}
