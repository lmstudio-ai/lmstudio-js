/**
 * Configuration for streaming progress tracking.
 * @public
 */
export interface StreamingProgressConfig {
  /**
   * Whether progress tracking is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback invoked on each token generated.
   */
  onToken?: (token: string, totalTokens: number) => void;

  /**
   * Callback invoked when a chunk is received.
   */
  onChunk?: (chunk: string, deltaTokens: number, totalTokens: number) => void;

  /**
   * Callback invoked with progress update.
   */
  onProgress?: (progress: StreamingProgress) => void;

  /**
   * Callback invoked when streaming completes.
   */
  onComplete?: (result: StreamingResult) => void;

  /**
   * Callback invoked on error.
   */
  onError?: (error: Error) => void;

  /**
   * Start time for progress tracking (for estimating time remaining).
   * @default current time
   */
  startTime?: number;
}

/**
 * Progress information during streaming.
 * @public
 */
export interface StreamingProgress {
  /**
   * Total number of tokens generated so far.
   */
  totalTokens: number;

  /**
   * Number of tokens per second.
   */
  tokensPerSecond: number;

  /**
   * Elapsed time in milliseconds.
   */
  elapsedMs: number;

  /**
   * Estimated time remaining in milliseconds (may be undefined if not estimable).
   */
  estimatedRemainingMs?: number;

  /**
   * Percentage completion (0-100), if max tokens is known.
   */
  percentComplete?: number;
}

/**
 * Result of a streaming operation.
 * @public
 */
export interface StreamingResult {
  /**
   * Complete generated text.
   */
  content: string;

  /**
   * Total number of tokens generated.
   */
  totalTokens: number;

  /**
   * Total time taken in milliseconds.
   */
  totalTimeMs: number;

  /**
   * Average tokens per second.
   */
  tokensPerSecond: number;

  /**
   * Whether the stream completed successfully.
   */
  success: boolean;

  /**
   * Error if stream failed.
   */
  error?: Error;
}

/**
 * Tracks progress of streaming responses.
 * @public
 */
export class StreamingProgressTracker {
  private tokenCount = 0;
  private content = "";
  private readonly startTime: number;
  private lastUpdateTime: number;
  private config: Required<StreamingProgressConfig>;

  public constructor(config: StreamingProgressConfig = {}) {
    this.startTime = config.startTime ?? Date.now();
    this.lastUpdateTime = this.startTime;
    this.config = {
      enabled: config.enabled ?? true,
      onToken: config.onToken,
      onChunk: config.onChunk,
      onProgress: config.onProgress,
      onComplete: config.onComplete,
      onError: config.onError,
      startTime: this.startTime,
    };
  }

  /**
   * Record a new token.
   */
  public recordToken(token: string): void {
    if (!this.config.enabled) {
      return;
    }

    this.tokenCount++;
    this.content += token;

    if (this.config.onToken) {
      this.config.onToken(token, this.tokenCount);
    }

    this.updateProgress();
  }

  /**
   * Record a chunk of content.
   */
  public recordChunk(chunk: string): void {
    if (!this.config.enabled) {
      return;
    }

    const previousTokenCount = this.tokenCount;
    const estimatedTokens = this.estimateTokenCount(chunk);
    this.tokenCount += estimatedTokens;
    this.content += chunk;

    if (this.config.onChunk) {
      this.config.onChunk(chunk, estimatedTokens, this.tokenCount);
    }

    this.updateProgress();
  }

  /**
   * Mark streaming as complete.
   */
  public complete(): StreamingResult {
    if (!this.config.enabled) {
      return {
        content: this.content,
        totalTokens: this.tokenCount,
        totalTimeMs: 0,
        tokensPerSecond: 0,
        success: true,
      };
    }

    const now = Date.now();
    const totalTimeMs = now - this.startTime;
    const tokensPerSecond = this.tokenCount > 0 ? (this.tokenCount / totalTimeMs) * 1000 : 0;

    const result: StreamingResult = {
      content: this.content,
      totalTokens: this.tokenCount,
      totalTimeMs,
      tokensPerSecond,
      success: true,
    };

    if (this.config.onComplete) {
      this.config.onComplete(result);
    }

    return result;
  }

  /**
   * Mark streaming as failed.
   */
  public fail(error: Error): StreamingResult {
    if (this.config.onError) {
      this.config.onError(error);
    }

    const now = Date.now();
    const totalTimeMs = now - this.startTime;
    const tokensPerSecond = this.tokenCount > 0 ? (this.tokenCount / totalTimeMs) * 1000 : 0;

    const result: StreamingResult = {
      content: this.content,
      totalTokens: this.tokenCount,
      totalTimeMs,
      tokensPerSecond,
      success: false,
      error,
    };

    return result;
  }

  /**
   * Get current progress.
   */
  public getProgress(maxTokens?: number): StreamingProgress {
    const now = Date.now();
    const elapsedMs = now - this.startTime;
    const tokensPerSecond = this.tokenCount > 0 ? (this.tokenCount / elapsedMs) * 1000 : 0;

    const progress: StreamingProgress = {
      totalTokens: this.tokenCount,
      tokensPerSecond,
      elapsedMs,
    };

    if (maxTokens !== undefined && tokensPerSecond > 0) {
      const remainingTokens = Math.max(0, maxTokens - this.tokenCount);
      progress.estimatedRemainingMs = (remainingTokens / tokensPerSecond) * 1000;
      progress.percentComplete = Math.min(100, (this.tokenCount / maxTokens) * 100);
    }

    return progress;
  }

  /**
   * Get total tokens generated.
   */
  public getTokenCount(): number {
    return this.tokenCount;
  }

  /**
   * Get content generated so far.
   */
  public getContent(): string {
    return this.content;
  }

  /**
   * Reset the tracker.
   */
  public reset(): void {
    this.tokenCount = 0;
    this.content = "";
    this.lastUpdateTime = Date.now();
  }

  /**
   * Estimate token count from text.
   * This uses a simple heuristic: ~1 token per 4 characters (avg for English).
   * @internal
   */
  private estimateTokenCount(text: string): number {
    // Simple estimation: ~1 token per 4 characters on average
    // This is a heuristic and may vary by language and model
    return Math.ceil(text.length / 4);
  }

  /**
   * Update progress with throttling.
   * @internal
   */
  private updateProgress(): void {
    const now = Date.now();
    // Throttle progress updates to once per 100ms
    if (now - this.lastUpdateTime < 100) {
      return;
    }

    this.lastUpdateTime = now;

    if (this.config.onProgress) {
      this.config.onProgress(this.getProgress());
    }
  }
}

/**
 * Creates a simple progress handler that logs to console.
 * @public
 */
export function createConsoleProgressHandler(
  verbose: boolean = false,
): Partial<StreamingProgressConfig> {
  return {
    onToken: verbose
      ? (token, totalTokens) => {
          console.log(`Token ${totalTokens}: ${token}`);
        }
      : undefined,
    onChunk: verbose
      ? (chunk, deltaTokens, totalTokens) => {
          console.log(`Chunk (${deltaTokens} tokens, total: ${totalTokens}): ${chunk.slice(0, 50)}`);
        }
      : undefined,
    onProgress: (progress) => {
      const percent = progress.percentComplete
        ? ` ${progress.percentComplete.toFixed(1)}%`
        : "";
      const remaining = progress.estimatedRemainingMs
        ? ` (${(progress.estimatedRemainingMs / 1000).toFixed(1)}s remaining)`
        : "";
      console.log(
        `Progress: ${progress.totalTokens} tokens, ${progress.tokensPerSecond.toFixed(1)} tok/s${percent}${remaining}`,
      );
    },
    onComplete: (result) => {
      console.log(
        `Complete: ${result.totalTokens} tokens in ${(result.totalTimeMs / 1000).toFixed(2)}s (${result.tokensPerSecond.toFixed(1)} tok/s)`,
      );
    },
    onError: (error) => {
      console.error("Stream error:", error.message);
    },
  };
}
