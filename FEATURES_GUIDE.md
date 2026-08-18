# LM Studio JS SDK - New Features Guide

This document describes the four new features added to the lmstudio-js SDK:

1. Enhanced Error Handling & Retry Logic
2. Model Caching Layer
3. Streaming Response Progress
4. Model Comparison Tools

## 1. Enhanced Error Handling & Retry Logic

### Overview
The SDK now includes built-in retry logic with exponential backoff for handling transient errors in RPC calls.

### Features
- **Automatic retries** with configurable retry policies
- **Exponential backoff** with jitter to avoid thundering herd
- **Configurable retry strategies** for different scenarios
- **Error classification** to determine which errors should trigger retry
- **Predefined retry policies** for common use cases

### Usage

#### Basic Usage
```typescript
import { LMStudioClient, predefinedRetryPolicies } from "@lmstudio/sdk";

const client = new LMStudioClient({
  retryPolicy: predefinedRetryPolicies.balanced,
});

const model = await client.llm.model("llama-3.2");
```

#### Custom Retry Policy
```typescript
import { createRetryPolicy } from "@lmstudio/sdk";

const customPolicy = createRetryPolicy({
  maxRetries: 5,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  useJitter: true,
  shouldRetry: (error) => {
    // Custom logic: only retry on specific errors
    return error.message.includes("timeout");
  },
  onRetry: (error, attemptNumber, delayMs) => {
    console.log(`Retry attempt ${attemptNumber} after ${delayMs}ms`);
  },
});
```

#### Predefined Policies

```typescript
import { predefinedRetryPolicies } from "@lmstudio/sdk";

// Aggressive: 5 retries, quick backoff
predefinedRetryPolicies.aggressive

// Balanced: 3 retries, moderate backoff (DEFAULT)
predefinedRetryPolicies.balanced

// Conservative: 2 retries, slow backoff
predefinedRetryPolicies.conservative

// No retry: fail immediately
predefinedRetryPolicies.none
```

#### Direct Retry API
```typescript
import { executeWithRetry } from "@lmstudio/sdk";

const result = await executeWithRetry(
  () => someAsyncOperation(),
  {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
  }
);
```

## 2. Model Caching Layer

### Overview
The SDK now provides a model metadata caching system to reduce repeated lookups and improve performance.

### Features
- **Automatic caching** of model metadata
- **Configurable TTL** (Time-To-Live)
- **Max entries limit** to prevent unbounded memory growth
- **Cache invalidation** strategies
- **Cache statistics** for monitoring
- **Disable caching** when needed

### Usage

#### Basic Usage
```typescript
import { ModelMetadataCache } from "@lmstudio/sdk";

const cache = new ModelMetadataCache({
  ttlMs: 300000, // 5 minutes
  maxEntries: 100,
});

// Set a value
cache.set("llama-3.2", { modelData });

// Get a value
const data = cache.get("llama-3.2");

// Check if cached
if (cache.has("llama-3.2")) {
  console.log("Model is cached");
}
```

#### Compute and Cache
```typescript
const modelData = await cache.getOrCompute(
  "llama-3.2",
  async () => {
    // This is only called if not in cache
    return await client.llm.getModelInfo("llama-3.2");
  }
);
```

#### Cache Manager
```typescript
import { CacheManager } from "@lmstudio/sdk";

const manager = new CacheManager({
  ttlMs: 300000,
  maxEntries: 100,
});

const modelCache = manager.getOrCreateCache("models");
const embeddingCache = manager.getOrCreateCache("embeddings");

// Get statistics
const stats = manager.getStats();
console.log(stats);
```

#### Cache Operations
```typescript
// Invalidate entries matching a predicate
cache.invalidateWhere(key => key.startsWith("old_"));

// Get cache statistics
const stats = cache.getStats();
console.log(`Active entries: ${stats.activeEntries}`);
console.log(`Expired entries: ${stats.expiredEntries}`);

// Clear all entries
cache.clear();

// Delete specific entry
cache.delete("specific-key");
```

## 3. Streaming Response Progress

### Overview
The SDK now provides progress tracking for streaming responses with real-time metrics.

### Features
- **Token counting** with progress callbacks
- **Progress estimation** including time remaining
- **Performance metrics** (tokens/second)
- **Completion callbacks** with final statistics
- **Error handling** with error callbacks
- **Throttled updates** to avoid callback spam

### Usage

#### Basic Progress Tracking
```typescript
import { StreamingProgressTracker } from "@lmstudio/sdk";

const tracker = new StreamingProgressTracker({
  onProgress: (progress) => {
    console.log(
      `${progress.totalTokens} tokens at ${progress.tokensPerSecond.toFixed(1)} tok/s`
    );
  },
});

// Record tokens as they're generated
tracker.recordToken("Hello");
tracker.recordToken(" ");
tracker.recordToken("world");

// Complete the tracking
const result = tracker.complete();
console.log(`Total: ${result.totalTokens} tokens in ${result.totalTimeMs}ms`);
```

#### Detailed Progress Tracking
```typescript
const tracker = new StreamingProgressTracker({
  onToken: (token, totalTokens) => {
    console.log(`Token ${totalTokens}: "${token}"`);
  },
  onChunk: (chunk, deltaTokens, totalTokens) => {
    console.log(`Chunk: +${deltaTokens} tokens (total: ${totalTokens})`);
  },
  onProgress: (progress) => {
    const percent = progress.percentComplete
      ? ` ${progress.percentComplete.toFixed(1)}%`
      : "";
    const eta = progress.estimatedRemainingMs
      ? ` ETA: ${(progress.estimatedRemainingMs / 1000).toFixed(1)}s`
      : "";
    console.log(`${progress.totalTokens} tok/s${percent}${eta}`);
  },
  onComplete: (result) => {
    console.log(
      `Completed: ${result.totalTokens} tokens in ${(result.totalTimeMs / 1000).toFixed(2)}s`
    );
  },
  onError: (error) => {
    console.error(`Stream failed: ${error.message}`);
  },
});
```

#### Console Progress Handler
```typescript
import { createConsoleProgressHandler } from "@lmstudio/sdk";

const tracker = new StreamingProgressTracker(
  createConsoleProgressHandler(verbose = true)
);

// Automatically logs progress to console
tracker.recordChunk("Hello world...");
```

## 4. Model Comparison Tools

### Overview
The SDK now includes tools for comparing performance of multiple models with the same input.

### Features
- **Batch model testing** with same input
- **Performance metrics** collection (latency, tokens, success)
- **Timeout handling** for long-running models
- **Multiple export formats** (text, JSON, CSV)
- **Statistical analysis** (fastest, slowest, average)

### Usage

#### Basic Comparison
```typescript
import { ModelComparisonRunner } from "@lmstudio/sdk";

const runner = new ModelComparisonRunner();

const result = await runner.compare(
  [
    { id: "model-a", respond: (input) => modelA.respond(input) },
    { id: "model-b", respond: (input) => modelB.respond(input) },
    { id: "model-c", respond: (input) => modelC.respond(input) },
  ],
  {
    input: "What is the capital of France?",
    timeoutMs: 30000,
  }
);

console.log(`Fastest: ${result.statistics.fastest}`);
console.log(`Average latency: ${result.statistics.averageLatencyMs.toFixed(2)}ms`);
```

#### Formatted Output
```typescript
import { formatComparisonResults } from "@lmstudio/sdk";

const formatted = formatComparisonResults(result);
console.log(formatted);

// Output:
// === Model Comparison Results ===
// Input: What is the capital of France?
//
// Models:
// | Model   | Latency (ms) | Tokens | Status |
// |---------|--------------|--------|--------|
// | model-a | 250          | 12     | ✓ Success |
// | model-b | 180          | 10     | ✓ Success |
// | model-c | 450          | 15     | ✗ Failed: timeout |
//
// Statistics:
//   Fastest: model-b
//   Slowest: model-c
//   Average Latency: 295.00ms
//   Success Rate: 2/3
```

#### Export Formats
```typescript
import {
  exportComparisonResultsAsJson,
  exportComparisonResultsAsCsv,
} from "@lmstudio/sdk";

// Export as JSON
const json = exportComparisonResultsAsJson(result);
fs.writeFileSync("comparison.json", json);

// Export as CSV
const csv = exportComparisonResultsAsCsv(result);
fs.writeFileSync("comparison.csv", csv);
```

## Integration Examples

### Retry + Caching + Progress Tracking
```typescript
import {
  LMStudioClient,
  predefinedRetryPolicies,
  ModelMetadataCache,
  StreamingProgressTracker,
} from "@lmstudio/sdk";

const client = new LMStudioClient({
  retryPolicy: predefinedRetryPolicies.balanced,
});

const cache = new ModelMetadataCache();

// Get model with caching
const model = await cache.getOrCompute(
  "llama-3.2",
  () => client.llm.model("llama-3.2")
);

// Use with progress tracking
const tracker = new StreamingProgressTracker({
  onProgress: (p) => console.log(`${p.totalTokens} tokens...`),
});

// Note: Integration with actual streaming needs custom implementation
// This is a placeholder showing the intended usage pattern
```

### Model Comparison Workflow
```typescript
import { ModelComparisonRunner, formatComparisonResults } from "@lmstudio/sdk";

const runner = new ModelComparisonRunner();

// Load multiple models
const models = await Promise.all([
  client.llm.model("llama-3.2"),
  client.llm.model("mistral-7b"),
  client.llm.model("neural-chat"),
]);

// Compare them
const result = await runner.compare(
  models.map(m => ({
    id: m.modelKey,
    respond: (input) => m.respond(input),
  })),
  { input: "Your test prompt here" }
);

// Display results
console.log(formatComparisonResults(result));
```

## Configuration Best Practices

### Retry Policy Selection
- **Aggressive**: For critical operations that must succeed, high retry overhead acceptable
- **Balanced**: General use case, good balance between reliability and performance
- **Conservative**: For fault-tolerant systems where retries should be minimal
- **None**: For fast-fail scenarios

### Cache Configuration
- **TTL**: Balance between freshness and cache hit rate
  - 5 minutes (300s) for mostly static data like model info
  - 30 seconds for dynamic data
  - 0 to disable
- **Max entries**: Based on expected number of unique models/embeddings
  - 100 for typical use
  - 1000 for large applications

### Progress Tracking
- Disable progress callbacks if not needed (slight performance impact)
- Use throttled updates (default 100ms) to avoid callback overhead
- Token estimation is a heuristic (~1 token per 4 chars); actual counts may vary

## Performance Considerations

1. **Retry Logic**: Adds minimal overhead; most effective for transient errors
2. **Caching**: Reduces API calls and latency; most effective with repeated model lookups
3. **Progress Tracking**: Minimal overhead with throttled updates; useful for UX
4. **Model Comparison**: Run sequentially by default; consider parallel execution for better comparison

## Testing

All new features include comprehensive test suites:

```bash
# Run tests for retry logic
npm test -- packages/lms-common/src/retryPolicy.test.ts

# Run tests for caching
npm test -- packages/lms-client/src/cache/ModelMetadataCache.test.ts

# Run tests for streaming progress
npm test -- packages/lms-client/src/streaming/ProgressTracker.test.ts

# Run tests for model comparison
npm test -- packages/lms-client/src/tools/ModelComparison.test.ts
```

## API Reference

### Retry Policy
- `RetryPolicyConfig`: Configuration interface
- `RetryStatistics`: Statistics from a retry operation
- `executeWithRetry()`: Execute function with retry
- `createRetryPolicy()`: Create a retry policy object
- `predefinedRetryPolicies`: Predefined policies

### Model Caching
- `ModelCacheConfig`: Cache configuration
- `ModelMetadataCache`: Single cache instance
- `CacheManager`: Manager for multiple caches

### Streaming Progress
- `StreamingProgressConfig`: Progress tracking configuration
- `StreamingProgress`: Current progress snapshot
- `StreamingResult`: Final result of streaming
- `StreamingProgressTracker`: Progress tracker instance
- `createConsoleProgressHandler()`: Create console logging handler

### Model Comparison
- `ModelComparisonConfig`: Comparison configuration
- `ModelMetrics`: Metrics for a single model
- `ModelComparisonResult`: Complete comparison result
- `ModelComparisonRunner`: Comparison runner instance
- Export functions: `formatComparisonResults()`, `exportComparisonResultsAsJson()`, `exportComparisonResultsAsCsv()`

## Contributing

These features are designed to be extensible. To contribute improvements:

1. Add tests for new functionality
2. Follow the existing code style
3. Update documentation
4. Submit a pull request

## License

MIT - See LICENSE file
