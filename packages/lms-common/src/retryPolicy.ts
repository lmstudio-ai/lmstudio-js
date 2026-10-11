/**
 * @public
 */
export interface RetryPolicyConfig {
  /**
   * Maximum number of retry attempts (not including the initial attempt).
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds before the first retry.
   * @default 100
   */
  initialDelayMs?: number;

  /**
   * Maximum delay in milliseconds between retries.
   * @default 10000
   */
  maxDelayMs?: number;

  /**
   * Multiplier for exponential backoff. Each retry delay is multiplied by this value.
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Whether to add random jitter to retry delays.
   * @default true
   */
  useJitter?: boolean;

  /**
   * Function to determine if an error should be retried.
   * Return true to retry, false to fail immediately.
   * @default retries on network errors and timeouts
   */
  shouldRetry?: (error: Error, attemptNumber: number) => boolean;

  /**
   * Optional callback invoked before each retry attempt.
   */
  onRetry?: (error: Error, attemptNumber: number, delayMs: number) => void;
}

/**
 * Statistics about a retry operation.
 * @public
 */
export interface RetryStatistics {
  totalAttempts: number;
  lastError?: Error;
  totalDelayMs: number;
  succeeded: boolean;
}

/**
 * Default list of error codes/messages that should trigger a retry.
 * @internal
 */
const DEFAULT_RETRYABLE_ERRORS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "socket hang up",
  "timeout",
];

/**
 * Default function to determine if an error should be retried.
 * @internal
 */
function defaultShouldRetry(error: Error): boolean {
  const errorStr = error.toString().toUpperCase();
  const messageStr = error.message.toUpperCase();

  for (const pattern of DEFAULT_RETRYABLE_ERRORS) {
    if (errorStr.includes(pattern.toUpperCase()) || messageStr.includes(pattern.toUpperCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates the delay for the next retry using exponential backoff.
 * @internal
 */
function calculateBackoffDelay(
  attemptNumber: number,
  config: Required<RetryPolicyConfig>,
): number {
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);
  delay = Math.min(delay, config.maxDelayMs);

  if (config.useJitter) {
    const jitter = delay * Math.random();
    delay = delay + jitter;
  }

  return Math.round(delay);
}

/**
 * Executes a function with retry logic using exponential backoff.
 * @public
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryPolicyConfig = {},
): Promise<T> {
  const mergedConfig: Required<RetryPolicyConfig> = {
    maxRetries: config.maxRetries ?? 3,
    initialDelayMs: config.initialDelayMs ?? 100,
    maxDelayMs: config.maxDelayMs ?? 10000,
    backoffMultiplier: config.backoffMultiplier ?? 2,
    useJitter: config.useJitter ?? true,
    shouldRetry: config.shouldRetry ?? defaultShouldRetry,
    onRetry: config.onRetry,
  };

  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attemptNumber = 1; attemptNumber <= mergedConfig.maxRetries + 1; attemptNumber++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attemptNumber > mergedConfig.maxRetries) {
        throw lastError;
      }

      if (!mergedConfig.shouldRetry(lastError, attemptNumber)) {
        throw lastError;
      }

      const delayMs = calculateBackoffDelay(attemptNumber, mergedConfig);
      totalDelayMs += delayMs;

      if (mergedConfig.onRetry) {
        mergedConfig.onRetry(lastError, attemptNumber, delayMs);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Retry logic error: should not reach this point");
}

/**
 * Creates a retry policy object with helper methods.
 * @public
 */
export function createRetryPolicy(config: RetryPolicyConfig = {}) {
  return {
    /**
     * Execute a function with retry logic
     */
    execute: <T,>(fn: () => Promise<T>) => executeWithRetry(fn, config),

    /**
     * Get the configuration
     */
    getConfig: () => ({ ...config }),

    /**
     * Create a new policy with merged configuration
     */
    merge: (newConfig: RetryPolicyConfig) =>
      createRetryPolicy({
        ...config,
        ...newConfig,
      }),
  };
}

/**
 * Predefined retry policies for common scenarios
 * @public
 */
export const predefinedRetryPolicies = {
  /**
   * Aggressive retry policy (many retries with short delays)
   */
  aggressive: {
    maxRetries: 5,
    initialDelayMs: 50,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5,
  } as RetryPolicyConfig,

  /**
   * Balanced retry policy (moderate retries with reasonable delays)
   */
  balanced: {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  } as RetryPolicyConfig,

  /**
   * Conservative retry policy (few retries with longer delays)
   */
  conservative: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  } as RetryPolicyConfig,

  /**
   * No retry policy (fail immediately)
   */
  none: {
    maxRetries: 0,
  } as RetryPolicyConfig,
};
