import { executeWithRetry, createRetryPolicy, predefinedRetryPolicies } from "./retryPolicy";

describe("retryPolicy", () => {
  describe("executeWithRetry", () => {
    it("should succeed on first attempt", async () => {
      const fn = jest.fn().mockResolvedValue("success");

      const result = await executeWithRetry(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce("success");

      const result = await executeWithRetry(fn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should fail after max retries exceeded", async () => {
      const error = new Error("Connection refused");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        executeWithRetry(fn, { maxRetries: 2, initialDelayMs: 10 }),
      ).rejects.toThrow("Connection refused");

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("should fail immediately if shouldRetry returns false", async () => {
      const error = new Error("Invalid input");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        executeWithRetry(fn, {
          maxRetries: 3,
          shouldRetry: () => false,
        }),
      ).rejects.toThrow("Invalid input");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should apply exponential backoff", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce("success");

      const onRetry = jest.fn();

      const result = await executeWithRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        useJitter: false,
        onRetry,
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);

      // Check that delays increase
      const delays = onRetry.mock.calls.map(call => call[2]);
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
    });

    it("should cap delays at maxDelayMs", async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new Error("Network error"));

      const onRetry = jest.fn();

      try {
        await executeWithRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 100,
          maxDelayMs: 300,
          backoffMultiplier: 3,
          useJitter: false,
          onRetry,
        });
      } catch (error) {
        // Expected to fail
      }

      const delays = onRetry.mock.calls.map(call => call[2]);
      expect(Math.max(...delays)).toBeLessThanOrEqual(300);
    });

    it("should handle default shouldRetry predicate", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce("success");

      const result = await executeWithRetry(fn, { maxRetries: 1, initialDelayMs: 10 });

      expect(result).toBe("success");
    });
  });

  describe("createRetryPolicy", () => {
    it("should create a retry policy with execute method", async () => {
      const policy = createRetryPolicy({ maxRetries: 1, initialDelayMs: 10 });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce("success");

      const result = await policy.execute(fn);

      expect(result).toBe("success");
    });

    it("should merge configurations", () => {
      const policy1 = createRetryPolicy({ maxRetries: 1 });
      const policy2 = policy1.merge({ initialDelayMs: 50 });

      const config = policy2.getConfig();
      expect(config.maxRetries).toBe(1);
      expect(config.initialDelayMs).toBe(50);
    });
  });

  describe("predefinedRetryPolicies", () => {
    it("should have aggressive policy", () => {
      expect(predefinedRetryPolicies.aggressive.maxRetries).toBe(5);
      expect(predefinedRetryPolicies.aggressive.initialDelayMs).toBe(50);
    });

    it("should have balanced policy", () => {
      expect(predefinedRetryPolicies.balanced.maxRetries).toBe(3);
      expect(predefinedRetryPolicies.balanced.initialDelayMs).toBe(100);
    });

    it("should have conservative policy", () => {
      expect(predefinedRetryPolicies.conservative.maxRetries).toBe(2);
      expect(predefinedRetryPolicies.conservative.initialDelayMs).toBe(500);
    });

    it("should have none policy", () => {
      expect(predefinedRetryPolicies.none.maxRetries).toBe(0);
    });
  });
});
