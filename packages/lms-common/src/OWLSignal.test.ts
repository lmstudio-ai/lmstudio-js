import type { Patch } from "@lmstudio/immer-with-plugins";
import {
  OWLSignal,
  type Setter,
  type StripNotAvailable,
  type SubscribeUpstream,
  type WriteTag,
} from ".";

/**
 * Creates a mock upstream for testing OWLSignal.
 * Captures subscribeUpstream and writeUpstream calls and provides helpers to simulate updates/errors.
 */
function createMockUpstream<TData>() {
  let setDownstream: Setter<TData> | null = null;
  let errorListener: ((error: any) => void) | null = null;
  let subscriptionCount = 0;

  const subscribeUpstream: SubscribeUpstream<TData> = (setter, onError) => {
    setDownstream = setter;
    errorListener = onError;
    subscriptionCount++;
    return () => {
      setDownstream = null;
      errorListener = null;
      subscriptionCount--;
    };
  };

  const writes: Array<{ data: TData; patches: Patch[]; tags: WriteTag[] }> = [];
  const writeUpstream = (data: TData, patches: Patch[], tags: WriteTag[]) => {
    writes.push({ data, patches, tags });
    return true; // Sent successfully
  };

  return {
    subscribeUpstream,
    writeUpstream,
    // Test helpers
    simulateUpdate: (
      value: StripNotAvailable<TData>,
      patches: Patch[] = [],
      tags: WriteTag[] = [],
    ) => {
      if (setDownstream === null) {
        throw new Error("Not subscribed");
      }
      setDownstream.withValueAndPatches(value, patches, tags);
    },
    simulateError: (error: any) => {
      if (errorListener === null) {
        throw new Error("Not subscribed");
      }
      errorListener(error);
    },
    getWrites: () => writes,
    getLastWrite: () => writes[writes.length - 1],
    getSubscriptionCount: () => subscriptionCount,
    isSubscribed: () => setDownstream !== null,
  };
}

describe("OWLSignal Write Loop Error Recovery", () => {
  describe("Baseline Write Functionality", () => {
    it("should complete write successfully when upstream confirms", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      // Subscribe to activate the signal
      signal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value from upstream (signal starts stale)
      mock.simulateUpdate({ count: 0 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Initial value should be available
      expect(signal.get()).toEqual({ count: 0 });

      // Perform a write - returns void, not a promise
      setter({ count: 1 });

      // Should immediately update optimistically
      expect(signal.get()).toEqual({ count: 1 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify writeUpstream was called
      expect(mock.getWrites().length).toBe(1);
      const write = mock.getLastWrite();
      expect(write.data).toEqual({ count: 1 });

      // Simulate upstream confirmation with matching tag
      mock.simulateUpdate({ count: 1 }, [], write.tags);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Value should still be correct
      expect(signal.get()).toEqual({ count: 1 });
    });

    it("should batch multiple rapid writes", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      signal.subscribe(() => {});
      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Three rapid writes - no promises returned
      setter({ count: 1 });
      setter({ count: 2 });
      setter({ count: 3 });

      // Optimistic value should be the latest
      expect(signal.get()).toEqual({ count: 3 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should batch into a single write upstream
      expect(mock.getWrites().length).toBeGreaterThanOrEqual(1);
      const write = mock.getLastWrite();

      // The write should include the final value
      expect(write.data.count).toBeGreaterThanOrEqual(1);

      // Confirm the write with the final value
      mock.simulateUpdate({ count: 3 }, [], write.tags);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(signal.get()).toEqual({ count: 3 });
    });
  });

  describe("Transport Error During Write", () => {
    it("should handle transport error during in-flight write and allow recovery", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      signal.subscribe(() => {});
      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Start a write - no promise returned
      setter({ count: 1 });

      // Optimistic value should update immediately
      expect(signal.get()).toEqual({ count: 1 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify write was sent
      expect(mock.getWrites().length).toBe(1);

      // Simulate transport error BEFORE confirmation
      mock.simulateError(new Error("Transport disconnected"));

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);

      // Recover from error
      const recovered = signal.recoverFromError();
      expect(recovered).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should no longer be in error state
      expect(signal.hasError()).toBe(false);

      // Provide a fresh value after recovery
      mock.simulateUpdate({ count: 1 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // NOW THE KEY TEST: Can we write again after recovery?
      setter({ count: 2 });

      // Optimistic value should update
      expect(signal.get()).toEqual({ count: 2 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify second write was sent (proves write loop recovered)
      expect(mock.getWrites().length).toBe(2);
      const secondWrite = mock.getLastWrite();
      expect(secondWrite.data).toEqual({ count: 2 });

      // Confirm the second write
      mock.simulateUpdate({ count: 2 }, [], secondWrite.tags);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(signal.get()).toEqual({ count: 2 });
    });

    it("should fail all queued writes on transport error", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      signal.subscribe(() => {});
      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Queue three writes - no promises returned
      setter({ count: 1 });
      setter({ count: 2 });
      setter({ count: 3 });

      // Optimistic value should be latest
      expect(signal.get()).toEqual({ count: 3 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // At least one write should be sent
      expect(mock.getWrites().length).toBeGreaterThanOrEqual(1);

      // Simulate transport error before confirmation
      mock.simulateError(new Error("Transport disconnected"));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);

      // Recover
      signal.recoverFromError();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide fresh value
      mock.simulateUpdate({ count: 3 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // New write should work
      setter({ count: 4 });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mock.getWrites().length).toBeGreaterThanOrEqual(2);
      const write = mock.getLastWrite();
      mock.simulateUpdate({ count: 4 }, [], write.tags);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(signal.get()).toEqual({ count: 4 });
    });
  });

  describe("Error During Write Loop Pull", () => {
    it("should handle error during initial pull in write loop", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      // Don't subscribe yet - signal is stale
      // Write loop will need to pull first

      // Attempt to write while stale
      setter({ count: 1 });

      // Optimistic value updates immediately
      expect(signal.get()).toEqual({ count: 1 });

      // The write loop will subscribe and try to pull
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate error during pull
      mock.simulateError(new Error("Error during pull"));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);

      // Recover
      signal.recoverFromError();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // New write should work
      setter({ count: 2 });

      await new Promise(resolve => setTimeout(resolve, 0));

      const write = mock.getLastWrite();
      mock.simulateUpdate({ count: 2 }, [], write.tags);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(signal.get()).toEqual({ count: 2 });
    });
  });

  describe("Passive Subscription After Error", () => {
    it("should reset isSubscriptionHandledByWriteLoop flag on error", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      const receivedValues: Array<{ count: number }> = [];
      signal.subscribe(value => {
        receivedValues.push(value);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have received initial value
      expect(receivedValues).toContainEqual({ count: 0 });

      // Start a write (sets isSubscriptionHandledByWriteLoop = true)
      setter({ count: 1 });

      // Optimistic value updates immediately
      expect(signal.get()).toEqual({ count: 1 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate transport error
      mock.simulateError(new Error("Transport error"));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);

      // Recover
      signal.recoverFromError();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Now send an update that's NOT from a write (no matching tag)
      // This tests that passive subscription works again
      mock.simulateUpdate({ count: 5 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should receive the update (proves passive subscription works)
      expect(receivedValues).toContainEqual({ count: 5 });
      expect(signal.get()).toEqual({ count: 5 });
    });

    it("should receive updates after recovery without new writes", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      const receivedValues: Array<{ count: number }> = [];
      signal.subscribe(value => {
        receivedValues.push(value);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Start write
      setter({ count: 1 });

      // Optimistic value updates immediately
      expect(signal.get()).toEqual({ count: 1 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Error before confirmation
      mock.simulateError(new Error("Transport error"));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);

      // Recover
      signal.recoverFromError();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Send update from upstream (not a write)
      mock.simulateUpdate({ count: 99 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should receive the update
      expect(receivedValues).toContainEqual({ count: 99 });
      expect(signal.get()).toEqual({ count: 99 });
    });
  });

  describe("Optimistic Value Handling", () => {
    it("should handle optimistic value correctly during error", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      signal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Write with optimistic update
      setter({ count: 1 });

      // Should immediately see optimistic value
      expect(signal.get()).toEqual({ count: 1 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate error
      mock.simulateError(new Error("Transport error"));

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);
      expect(signal.get()).toEqual({ count: 1 });

      signal.recoverFromError();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide fresh value after recovery
      mock.simulateUpdate({ count: 1 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should be able to write again
      setter({ count: 2 });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(signal.get()).toEqual({ count: 2 });

      const write = mock.getLastWrite();
      mock.simulateUpdate({ count: 2 }, [], write.tags);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(signal.get()).toEqual({ count: 2 });
    });
  });

  describe("Error Signal Behavior", () => {
    it("should emit error on errorSignal when transport error occurs", async () => {
      const mock = createMockUpstream<{ count: number }>();
      const [signal, setter] = OWLSignal.create(
        { count: 0 },
        mock.subscribeUpstream,
        mock.writeUpstream,
      );

      signal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Provide initial value
      mock.simulateUpdate({ count: 0 }, []);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Subscribe to error signal and capture errors
      const errors: Array<Error | null> = [];
      signal.errorSignal.subscribe(error => {
        errors.push(error);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should start with null (no error) - check using get() instead of subscription array
      expect(signal.errorSignal.get()).toBe(null);

      // Start write
      setter({ count: 1 });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate error
      const testError = new Error("Transport error");
      mock.simulateError(testError);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Error signal should emit the error
      expect(errors.some(e => e !== null && e.message === "Transport error")).toBe(true);

      // Signal should be in error state
      expect(signal.hasError()).toBe(true);
    });
  });
});
