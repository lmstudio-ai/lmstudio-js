import { makePromise } from "./makePromise.js";

interface PromiseBundle<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

const finished = Symbol("finished");
type Finished = typeof finished;

/**
 * A StreamablePromise is a promise-like that is also async iterable. This means you can use it as a
 * promise (awaiting it, using `.then`, `.catch`, etc.), and you can also use it as an async
 * iterable (using `for await`).
 *
 * Notably, as much as it implements the async iterable interface, it is not a traditional iterable,
 * as it internally maintains a buffer and new values are pushed into the buffer by the producer, as
 * oppose to being pulled by the consumer.
 *
 * The async iterable interface is used instead of the Node.js object stream because streams are too
 * clunky to use, and the `for await` syntax is much more ergonomic for most people.
 *
 * If any iterator is created for this instance, an empty rejection handler will be attached to the
 * promise to prevent unhandled rejection warnings.
 *
 * This class is provided as an abstract class and is meant to be extended. Crucially, the `collect`
 * method must be implemented, which will be called to convert an array of values into the final
 * resolved value of the promise.
 *
 * In addition, the constructor of the subclass should be marked as private, and a static method
 * that exposes the constructor, the `finished` method, and the `push` method should be provided.
 *
 * @typeParam TFragment - The type of the individual fragments that are pushed into the buffer.
 * @typeParam TFinal - The type of the final resolved value of the promise.
 * @public
 */
export abstract class StreamablePromise<TFragment, TFinal>
  implements Promise<TFinal>, AsyncIterable<TFragment>
{
  protected abstract collect(fragments: ReadonlyArray<TFragment>): Promise<TFinal>;

  private promiseFinal: Promise<TFinal>;
  private resolveFinal!: (value: TFinal | PromiseLike<TFinal>) => void;
  private rejectFinal!: (reason?: any) => void;
  protected status: "pending" | "resolved" | "rejected" = "pending";
  private buffer: Array<TFragment> = [];
  private nextFragmentPromiseBundle: PromiseBundle<TFragment | Finished> | null = null;
  /**
   * If there has ever been any iterators created for this instance. Once any iterator is created,
   * a reject handler will be attached to the promise to prevent unhandled rejection warnings, as
   * the errors will be handled by the iterator.
   *
   * The purpose of this variable is to prevent registering the reject handler more than once.
   */
  private hasIterator = false;

  /**
   * Called by the producer when it has finished producing values. If an error is provided, the
   * promise will be rejected with that error. If no error is provided, the promise will be resolved
   * with the final value.
   *
   * This method should be exposed in the static constructor of the subclass.
   *
   * @param error - The error to reject the promise with, if any.
   */
  protected finished(error?: any) {
    if (this.status !== "pending") {
      throw new Error("`finished` called while not pending");
    }
    if (error === undefined) {
      this.status = "resolved";
      this.nextFragmentPromiseBundle?.resolve(finished);
      this.resolveFinal(this.collect(this.buffer));
    } else {
      this.status = "rejected";
      this.nextFragmentPromiseBundle?.reject(error);
      this.rejectFinal(error);
    }
  }

  /**
   * Called by the producer to push a new fragment into the buffer. This method should be exposed in
   * the static constructor of the subclass.
   *
   * This method should be exposed in the static constructor of the subclass.
   *
   * @param fragment - The fragment to push into the buffer.
   */
  protected push(fragment: TFragment) {
    if (this.status !== "pending") {
      throw new Error("`push` called while not pending");
    }
    this.buffer.push(fragment);
    this.nextFragmentPromiseBundle?.resolve(fragment);
    this.nextFragmentPromiseBundle = null;
  }

  protected constructor() {
    const { promise, resolve, reject } = makePromise<TFinal>();
    this.promiseFinal = promise;
    this.resolveFinal = resolve;
    this.rejectFinal = reject;
  }

  public then<TResult1 = TFinal, TResult2 = never>(
    onfulfilled?: ((value: TFinal) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): Promise<TResult1 | TResult2> {
    return this.promiseFinal.then(onfulfilled, onrejected);
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined,
  ): Promise<TFinal | TResult> {
    return this.promiseFinal.catch(onrejected);
  }

  public finally(onfinally?: (() => void) | null | undefined): Promise<TFinal> {
    return this.promiseFinal.finally(onfinally);
  }

  public [Symbol.toStringTag] = "StreamablePromise";

  /**
   * If nextFragmentPromiseBundle exists, it is returned. Otherwise, a new one is created and
   * returned.
   */
  private obtainNextFragmentPromiseBundle(): PromiseBundle<TFragment | Finished> {
    if (this.nextFragmentPromiseBundle === null) {
      this.nextFragmentPromiseBundle = makePromise<TFragment | Finished>();
    }
    return this.nextFragmentPromiseBundle;
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<TFragment, any, undefined> {
    if (!this.hasIterator) {
      this.promiseFinal.catch(() => {}); // Prevent unhandled rejection warning
      this.hasIterator = true;
    }
    let i = 0;
    while (i < this.buffer.length || this.status === "pending") {
      if (i < this.buffer.length) {
        yield this.buffer[i];
        i++;
      } else {
        const nextFragmentPromiseBundle = this.obtainNextFragmentPromiseBundle();
        const nextFragment = await nextFragmentPromiseBundle.promise;
        if (nextFragment === finished) {
          // Make sure the promise is resolved before breaking the loop.
          break;
        }
        yield nextFragment;
        i++;
      }
    }
    await this.promiseFinal;
    // Wait for one more microtask to ensure that the promise is resolved before terminating the
    // loop. This ensures that the by the time async loop is terminated, the onMessage handler is
    // already triggered.
    await Promise.resolve();
  }
}
