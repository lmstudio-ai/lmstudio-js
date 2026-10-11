/**
 * Configuration for model comparison.
 * @public
 */
export interface ModelComparisonConfig {
  /**
   * Test input to send to all models.
   */
  input: string;

  /**
   * Parameters to use for all models.
   */
  parameters?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  };

  /**
   * Whether to stream responses.
   * @default false
   */
  stream?: boolean;

  /**
   * Timeout in milliseconds for each model.
   * @default 30000
   */
  timeoutMs?: number;
}

/**
 * Metrics for a single model in comparison.
 * @public
 */
export interface ModelMetrics {
  /**
   * Model identifier/name.
   */
  modelId: string;

  /**
   * Generated response.
   */
  response: string;

  /**
   * Time taken to generate response in milliseconds.
   */
  latencyMs: number;

  /**
   * Number of tokens in the response.
   */
  outputTokens: number;

  /**
   * Whether the model succeeded.
   */
  success: boolean;

  /**
   * Error message if the model failed.
   */
  error?: string;

  /**
   * Additional metadata.
   */
  metadata?: Record<string, any>;
}

/**
 * Result of model comparison.
 * @public
 */
export interface ModelComparisonResult {
  /**
   * Input used for comparison.
   */
  input: string;

  /**
   * Metrics for each model.
   */
  metrics: ModelMetrics[];

  /**
   * Overall statistics.
   */
  statistics: {
    /**
     * Fastest model by latency.
     */
    fastest: string;

    /**
     * Slowest model by latency.
     */
    slowest: string;

    /**
     * Average latency across all models.
     */
    averageLatencyMs: number;

    /**
     * Models that succeeded.
     */
    successCount: number;

    /**
     * Models that failed.
     */
    failureCount: number;
  };

  /**
   * Timestamp when comparison was performed.
   */
  timestamp: number;
}

/**
 * Benchmark runner for comparing model performance.
 * @public
 */
export class ModelComparisonRunner {
  /**
   * Compare multiple models with the same input.
   */
  public async compare(
    models: Array<{ id: string; respond: (input: string) => Promise<string> }>,
    config: ModelComparisonConfig,
  ): Promise<ModelComparisonResult> {
    const results: ModelMetrics[] = [];

    for (const model of models) {
      const metric = await this.runModelTest(model.id, model.respond, config);
      results.push(metric);
    }

    return this.compileResults(config.input, results);
  }

  /**
   * Run a single model test.
   * @internal
   */
  private async runModelTest(
    modelId: string,
    respond: (input: string) => Promise<string>,
    config: ModelComparisonConfig,
  ): Promise<ModelMetrics> {
    const startTime = Date.now();

    try {
      const response = await Promise.race([
        respond(config.input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Model timeout")), config.timeoutMs ?? 30000),
        ),
      ]);

      const latencyMs = Date.now() - startTime;
      const outputTokens = this.estimateTokenCount(response);

      return {
        modelId,
        response,
        latencyMs,
        outputTokens,
        success: true,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        modelId,
        response: "",
        latencyMs,
        outputTokens: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Compile results and calculate statistics.
   * @internal
   */
  private compileResults(input: string, metrics: ModelMetrics[]): ModelComparisonResult {
    const successfulMetrics = metrics.filter(m => m.success);
    const latencies = successfulMetrics.map(m => m.latencyMs);

    const fastest = successfulMetrics.reduce((prev, current) =>
      prev.latencyMs < current.latencyMs ? prev : current,
    );

    const slowest = successfulMetrics.reduce((prev, current) =>
      prev.latencyMs > current.latencyMs ? prev : current,
    );

    const averageLatencyMs =
      successfulMetrics.length > 0
        ? successfulMetrics.reduce((sum, m) => sum + m.latencyMs, 0) / successfulMetrics.length
        : 0;

    return {
      input,
      metrics,
      statistics: {
        fastest: fastest.modelId,
        slowest: slowest.modelId,
        averageLatencyMs,
        successCount: successfulMetrics.length,
        failureCount: metrics.length - successfulMetrics.length,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Estimate token count from text.
   * @internal
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Formats comparison results as a readable table.
 * @public
 */
export function formatComparisonResults(result: ModelComparisonResult): string {
  const lines: string[] = [];

  lines.push("=== Model Comparison Results ===");
  lines.push(`Input: ${result.input.substring(0, 50)}${result.input.length > 50 ? "..." : ""}`);
  lines.push("");

  // Model metrics table
  lines.push("Models:");
  lines.push(
    "| Model | Latency (ms) | Tokens | Status |",
  );
  lines.push("|-------|--------------|--------|--------|");

  for (const metric of result.metrics) {
    const status = metric.success ? "✓ Success" : `✗ Failed: ${metric.error}`;
    lines.push(
      `| ${metric.modelId} | ${metric.latencyMs} | ${metric.outputTokens} | ${status} |`,
    );
  }

  lines.push("");

  // Statistics
  lines.push("Statistics:");
  lines.push(`  Fastest: ${result.statistics.fastest}`);
  lines.push(`  Slowest: ${result.statistics.slowest}`);
  lines.push(`  Average Latency: ${result.statistics.averageLatencyMs.toFixed(2)}ms`);
  lines.push(
    `  Success Rate: ${result.statistics.successCount}/${result.metrics.length}`,
  );

  return lines.join("\n");
}

/**
 * Exports comparison results as JSON.
 * @public
 */
export function exportComparisonResultsAsJson(result: ModelComparisonResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Exports comparison results as CSV.
 * @public
 */
export function exportComparisonResultsAsCsv(result: ModelComparisonResult): string {
  const lines: string[] = [];

  // Header
  lines.push("Model,Latency (ms),Output Tokens,Success,Error");

  // Data rows
  for (const metric of result.metrics) {
    const status = metric.success ? "Yes" : "No";
    const error = metric.error ? `"${metric.error}"` : "";
    lines.push(
      `${metric.modelId},${metric.latencyMs},${metric.outputTokens},${status},${error}`,
    );
  }

  // Summary
  lines.push("");
  lines.push("Statistics");
  lines.push(
    `Fastest,${result.statistics.fastest}`,
  );
  lines.push(
    `Slowest,${result.statistics.slowest}`,
  );
  lines.push(
    `Average Latency (ms),${result.statistics.averageLatencyMs}`,
  );
  lines.push(
    `Success Rate,${result.statistics.successCount}/${result.metrics.length}`,
  );

  return lines.join("\n");
}
