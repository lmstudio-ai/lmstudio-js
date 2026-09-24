import { StreamingProgressTracker, createConsoleProgressHandler } from "./ProgressTracker";

describe("StreamingProgressTracker", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should track tokens", () => {
    const tracker = new StreamingProgressTracker();
    tracker.recordToken("Hello");
    tracker.recordToken(" ");
    tracker.recordToken("world");

    expect(tracker.getTokenCount()).toBe(3);
    expect(tracker.getContent()).toBe("Hello world");
  });

  it("should track chunks", () => {
    const tracker = new StreamingProgressTracker();
    tracker.recordChunk("Hello world");
    tracker.recordChunk(" - this is a test");

    expect(tracker.getContent()).toBe("Hello world - this is a test");
  });

  it("should call onToken callback", () => {
    const onToken = jest.fn();
    const tracker = new StreamingProgressTracker({ onToken });

    tracker.recordToken("a");
    tracker.recordToken("b");

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith("a", 1);
    expect(onToken).toHaveBeenCalledWith("b", 2);
  });

  it("should call onChunk callback", () => {
    const onChunk = jest.fn();
    const tracker = new StreamingProgressTracker({ onChunk });

    tracker.recordChunk("hello");
    tracker.recordChunk(" world");

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls[0][0]).toBe("hello");
    expect(onChunk.mock.calls[1][0]).toBe(" world");
  });

  it("should throttle progress updates", () => {
    const onProgress = jest.fn();
    const tracker = new StreamingProgressTracker({ onProgress });

    tracker.recordToken("a");
    jest.advanceTimersByTime(50); // Less than 100ms
    tracker.recordToken("b");
    jest.advanceTimersByTime(60); // Now > 100ms total
    tracker.recordToken("c");

    // Should be called fewer times due to throttling
    expect(onProgress.mock.calls.length).toBeLessThan(3);
  });

  it("should complete successfully", () => {
    const onComplete = jest.fn();
    const tracker = new StreamingProgressTracker({ onComplete });

    tracker.recordToken("test");
    jest.advanceTimersByTime(100);
    const result = tracker.complete();

    expect(result.success).toBe(true);
    expect(result.content).toBe("test");
    expect(result.totalTokens).toBe(1);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(100);
    expect(onComplete).toHaveBeenCalledWith(result);
  });

  it("should handle errors", () => {
    const onError = jest.fn();
    const tracker = new StreamingProgressTracker({ onError });

    tracker.recordToken("partial");
    const error = new Error("Stream failed");
    const result = tracker.fail(error);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.content).toBe("partial");
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("should calculate tokens per second", () => {
    const tracker = new StreamingProgressTracker();

    tracker.recordToken("a");
    tracker.recordToken("b");
    tracker.recordToken("c");
    tracker.recordToken("d");

    jest.advanceTimersByTime(2000); // 2 seconds

    const progress = tracker.getProgress();

    expect(progress.totalTokens).toBe(4);
    expect(progress.tokensPerSecond).toBeCloseTo(2, 1); // 4 tokens in 2 seconds
  });

  it("should estimate remaining time", () => {
    const tracker = new StreamingProgressTracker();

    tracker.recordToken("a");
    tracker.recordToken("b");
    jest.advanceTimersByTime(1000); // 1 second

    const progress = tracker.getProgress(10); // max 10 tokens

    expect(progress.estimatedRemainingMs).toBeDefined();
    expect(progress.estimatedRemainingMs).toBeGreaterThan(0);
  });

  it("should calculate percent complete", () => {
    const tracker = new StreamingProgressTracker();

    tracker.recordToken("a");
    tracker.recordToken("b");
    tracker.recordToken("c");
    tracker.recordToken("d");
    tracker.recordToken("e");

    const progress = tracker.getProgress(10);

    expect(progress.percentComplete).toBe(50);
  });

  it("should respect enabled flag", () => {
    const onToken = jest.fn();
    const tracker = new StreamingProgressTracker({ enabled: false, onToken });

    tracker.recordToken("a");

    expect(onToken).not.toHaveBeenCalled();
    expect(tracker.getTokenCount()).toBe(0);
  });

  it("should reset tracker", () => {
    const tracker = new StreamingProgressTracker();

    tracker.recordToken("a");
    tracker.recordToken("b");

    expect(tracker.getTokenCount()).toBe(2);

    tracker.reset();

    expect(tracker.getTokenCount()).toBe(0);
    expect(tracker.getContent()).toBe("");
  });

  it("should accept custom start time", () => {
    const startTime = Date.now() - 5000; // 5 seconds ago
    const tracker = new StreamingProgressTracker({ startTime });

    tracker.recordToken("a");
    jest.advanceTimersByTime(1000);

    const progress = tracker.getProgress();

    expect(progress.elapsedMs).toBeGreaterThanOrEqual(6000);
  });
});

describe("createConsoleProgressHandler", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  it("should log progress updates", () => {
    const handler = createConsoleProgressHandler();
    const tracker = new StreamingProgressTracker(handler);

    tracker.recordToken("a");

    expect(console.log).toHaveBeenCalled();
  });

  it("should log on complete", () => {
    const handler = createConsoleProgressHandler();
    const tracker = new StreamingProgressTracker(handler);

    tracker.recordToken("test");
    tracker.complete();

    const calls = (console.log as jest.Mock).mock.calls.map(c => c[0]);
    expect(calls.some(c => c.includes("Complete"))).toBe(true);
  });

  it("should log on error", () => {
    const handler = createConsoleProgressHandler();
    const tracker = new StreamingProgressTracker(handler);

    const error = new Error("Test error");
    tracker.fail(error);

    expect(console.error).toHaveBeenCalled();
  });
});
