import {
  ModelComparisonRunner,
  formatComparisonResults,
  exportComparisonResultsAsJson,
  exportComparisonResultsAsCsv,
} from "./ModelComparison";

describe("ModelComparisonRunner", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should compare multiple models", async () => {
    const runner = new ModelComparisonRunner();

    const models = [
      {
        id: "model1",
        respond: jest.fn().mockResolvedValue("Response from model1"),
      },
      {
        id: "model2",
        respond: jest.fn().mockResolvedValue("Response from model2"),
      },
    ];

    const result = await runner.compare(models, {
      input: "Hello, how are you?",
    });

    expect(result.metrics).toHaveLength(2);
    expect(result.metrics[0].modelId).toBe("model1");
    expect(result.metrics[1].modelId).toBe("model2");
    expect(result.metrics[0].success).toBe(true);
    expect(result.metrics[1].success).toBe(true);
  });

  it("should measure latency", async () => {
    const runner = new ModelComparisonRunner();

    const models = [
      {
        id: "model1",
        respond: jest.fn(async () => {
          jest.advanceTimersByTime(100);
          return "Response";
        }),
      },
    ];

    const result = await runner.compare(models, {
      input: "Test",
    });

    expect(result.metrics[0].latencyMs).toBeGreaterThanOrEqual(100);
  });

  it("should handle model failures", async () => {
    const runner = new ModelComparisonRunner();

    const models = [
      {
        id: "model1",
        respond: jest.fn().mockRejectedValue(new Error("Model error")),
      },
    ];

    const result = await runner.compare(models, {
      input: "Test",
    });

    expect(result.metrics[0].success).toBe(false);
    expect(result.metrics[0].error).toBe("Model error");
  });

  it("should handle model timeout", async () => {
    const runner = new ModelComparisonRunner();

    const models = [
      {
        id: "model1",
        respond: jest.fn(async () => {
          jest.advanceTimersByTime(5000);
          return "Response";
        }),
      },
    ];

    const promise = runner.compare(models, {
      input: "Test",
      timeoutMs: 1000,
    });

    jest.advanceTimersByTime(2000);

    const result = await promise;

    expect(result.metrics[0].success).toBe(false);
    expect(result.metrics[0].error).toContain("timeout");
  });

  it("should calculate statistics", async () => {
    const runner = new ModelComparisonRunner();

    const models = [
      {
        id: "model1",
        respond: jest.fn(async () => {
          jest.advanceTimersByTime(100);
          return "Response1";
        }),
      },
      {
        id: "model2",
        respond: jest.fn(async () => {
          jest.advanceTimersByTime(50);
          return "Response2";
        }),
      },
      {
        id: "model3",
        respond: jest.fn().mockRejectedValue(new Error("Failed")),
      },
    ];

    const result = await runner.compare(models, {
      input: "Test",
    });

    expect(result.statistics.fastest).toBe("model2");
    expect(result.statistics.slowest).toBe("model1");
    expect(result.statistics.successCount).toBe(2);
    expect(result.statistics.failureCount).toBe(1);
  });

  it("should estimate output tokens", async () => {
    const runner = new ModelComparisonRunner();

    const models = [
      {
        id: "model1",
        respond: jest.fn().mockResolvedValue("This is a test response with multiple words"),
      },
    ];

    const result = await runner.compare(models, {
      input: "Test",
    });

    expect(result.metrics[0].outputTokens).toBeGreaterThan(0);
  });
});

describe("formatComparisonResults", () => {
  it("should format results as readable table", () => {
    const result = {
      input: "Hello, how are you?",
      metrics: [
        {
          modelId: "model1",
          response: "Response 1",
          latencyMs: 100,
          outputTokens: 5,
          success: true,
        },
        {
          modelId: "model2",
          response: "Response 2",
          latencyMs: 150,
          outputTokens: 6,
          success: false,
          error: "Model error",
        },
      ],
      statistics: {
        fastest: "model1",
        slowest: "model2",
        averageLatencyMs: 125,
        successCount: 1,
        failureCount: 1,
      },
      timestamp: Date.now(),
    };

    const formatted = formatComparisonResults(result);

    expect(formatted).toContain("Model Comparison Results");
    expect(formatted).toContain("model1");
    expect(formatted).toContain("model2");
    expect(formatted).toContain("100");
    expect(formatted).toContain("Success Rate");
  });
});

describe("exportComparisonResultsAsJson", () => {
  it("should export as JSON", () => {
    const result = {
      input: "Test",
      metrics: [
        {
          modelId: "model1",
          response: "Response",
          latencyMs: 100,
          outputTokens: 5,
          success: true,
        },
      ],
      statistics: {
        fastest: "model1",
        slowest: "model1",
        averageLatencyMs: 100,
        successCount: 1,
        failureCount: 0,
      },
      timestamp: Date.now(),
    };

    const json = exportComparisonResultsAsJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.input).toBe("Test");
    expect(parsed.metrics).toHaveLength(1);
  });
});

describe("exportComparisonResultsAsCsv", () => {
  it("should export as CSV", () => {
    const result = {
      input: "Test",
      metrics: [
        {
          modelId: "model1",
          response: "Response",
          latencyMs: 100,
          outputTokens: 5,
          success: true,
        },
        {
          modelId: "model2",
          response: "Response",
          latencyMs: 150,
          outputTokens: 6,
          success: false,
          error: "Error message",
        },
      ],
      statistics: {
        fastest: "model1",
        slowest: "model2",
        averageLatencyMs: 125,
        successCount: 1,
        failureCount: 1,
      },
      timestamp: Date.now(),
    };

    const csv = exportComparisonResultsAsCsv(result);

    expect(csv).toContain("Model,Latency");
    expect(csv).toContain("model1,100");
    expect(csv).toContain("model2,150");
    expect(csv).toContain("Fastest,model1");
  });
});
