import { isAvailable, Signal, SimpleLogger } from "@lmstudio/lms-common";
import { BackendInterface } from "@lmstudio/lms-communication";
import { type Context, type ContextCreator } from "@lmstudio/lms-communication-server";
import { z } from "zod";
import { createControllableMockedPorts } from "./createControllableMockedPorts.js";

/**
 * Creates a simple test context creator.
 */
function createTestContextCreator(): ContextCreator<Context> {
  return params => ({
    logger: new SimpleLogger(`Test:${params.endpointName}`),
  });
}

describe("Signal Recovery", () => {
  describe("Basic Recovery", () => {
    it("should recover signal after transport disconnect and reconnect", async () => {
      // Create a signal on the server side that we can control
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      // Create backend interface with a signal endpoint
      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      // Register handler that returns our controllable signal
      backendInterface.handleSignalEndpoint("testSignal", (_ctx, _param) => {
        return serverSignal;
      });

      // Create controllable mocked ports
      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      // Create client-side signal and subscribe
      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const receivedValues: Array<{ value: number }> = [];
      clientSignal.subscribe(value => {
        if (isAvailable(value)) {
          receivedValues.push(value);
        }
      });

      // Update server signal and verify client receives it
      setServerSignal({ value: 1 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(receivedValues).toContainEqual({ value: 1 });

      // Simulate disconnect
      simulateDisconnect();
      expect(clientSignal.hasError()).toBe(true);

      // Signal should be stale
      expect(clientSignal.isStale()).toBe(true);

      // Simulate reconnect - this should trigger recovery
      simulateReconnect();

      // Wait for reconnection and resubscription
      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should no longer be in error state
      expect(clientSignal.hasError()).toBe(false);

      // Update server signal after recovery
      setServerSignal({ value: 2 });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Client should receive the new value (proves resubscription worked)
      expect(receivedValues).toContainEqual({ value: 2 });
    });

    it("should track signal for recovery when transport errors", async () => {
      const [serverSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Before disconnect, signal should not be in error state
      expect(clientSignal.hasError()).toBe(false);

      // Disconnect
      simulateDisconnect();

      // Signal should now be in error state
      expect(clientSignal.hasError()).toBe(true);

      // Reconnect
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be recovered
      expect(clientSignal.hasError()).toBe(false);
    });

    it("should receive latest server value on reconnect without server re-emitting", async () => {
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const receivedValues: number[] = [];
      clientSignal.subscribe(value => {
        if (isAvailable(value)) {
          receivedValues.push(value.value);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have received initial value (0)
      expect(receivedValues).toContain(0);

      // Disconnect
      simulateDisconnect();
      expect(clientSignal.hasError()).toBe(true);

      // Update server signal WHILE DISCONNECTED
      setServerSignal({ value: 100 });
      setServerSignal({ value: 200 });
      setServerSignal({ value: 300 });

      // Client should NOT have received these updates (disconnected)
      expect(receivedValues).not.toContain(100);
      expect(receivedValues).not.toContain(200);
      expect(receivedValues).not.toContain(300);

      // Clear received values to track what we get on reconnect
      const valuesBeforeReconnect = [...receivedValues];

      // Reconnect - client should immediately receive the LATEST value (300)
      // without server having to trigger another update
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have received the latest value on reconnect
      expect(receivedValues.length).toBeGreaterThan(valuesBeforeReconnect.length);
      expect(receivedValues).toContain(300);

      // Signal should not be stale anymore
      expect(clientSignal.isStale()).toBe(false);
      expect(clientSignal.get()).toEqual({ value: 300 });
    });
  });

  describe("Subscriber Behavior", () => {
    it("should not resubscribe if signal has no active subscribers on reconnect", async () => {
      let subscriptionCount = 0;
      const [serverSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => {
        subscriptionCount++;
        return serverSignal;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const unsubscribe = clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(subscriptionCount).toBe(1);

      // Unsubscribe before disconnect
      unsubscribe();

      // Disconnect
      simulateDisconnect();

      // Reconnect - should NOT trigger resubscription since no active subscribers
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Still only 1 subscription (no resubscription since no active subscribers)
      expect(subscriptionCount).toBe(1);
    });

    it("should handle unsubscribe during disconnected state", async () => {
      const [serverSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const unsubscribe = clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Disconnect
      simulateDisconnect();

      // Unsubscribe while disconnected
      unsubscribe();

      // Reconnect - should not throw and signal should remain in error state
      // (since there are no subscribers, recovery won't resubscribe)
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Error should be cleared by recovery, but signal has no subscribers
      expect(clientSignal.hasError()).toBe(false);
    });
  });

  describe("Error Promise", () => {
    it("should emit errors on errorSignal and clear after recovery", async () => {
      const [serverSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Subscribe to error signal
      const errors: Array<Error | null> = [];
      clientSignal.errorSignal.subscribe(error => {
        errors.push(error);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should start with no error
      expect(clientSignal.errorSignal.get()).toBe(null);

      // First disconnect
      simulateDisconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have an error
      expect(clientSignal.errorSignal.get()).not.toBe(null);
      expect(clientSignal.errorSignal.get()).toBeInstanceOf(Error);

      // Reconnect
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Error should be cleared (set to null)
      expect(clientSignal.errorSignal.get()).toBe(null);

      // Second disconnect - should emit new error
      simulateDisconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have an error again
      expect(clientSignal.errorSignal.get()).not.toBe(null);
      expect(clientSignal.errorSignal.get()).toBeInstanceOf(Error);
    });
  });

  describe("Multiple Signals and Cycles", () => {
    it("should handle multiple disconnect/reconnect cycles", async () => {
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const receivedValues: number[] = [];
      clientSignal.subscribe(value => {
        if (isAvailable(value)) {
          receivedValues.push(value.value);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Cycle 1
      setServerSignal({ value: 1 });
      await new Promise(resolve => setTimeout(resolve, 0));
      simulateDisconnect();
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Cycle 2
      setServerSignal({ value: 2 });
      await new Promise(resolve => setTimeout(resolve, 0));
      simulateDisconnect();
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Cycle 3
      setServerSignal({ value: 3 });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should have received all values across all cycles
      expect(receivedValues).toContain(1);
      expect(receivedValues).toContain(2);
      expect(receivedValues).toContain(3);
    });

    it("should recover multiple signals from the same client port", async () => {
      const [serverSignal1, setServerSignal1] = Signal.create({ value: 10 });
      const [serverSignal2, setServerSignal2] = Signal.create({ value: 20 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", (_ctx, param) => {
        return param.id === "signal-1" ? serverSignal1 : serverSignal2;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal1 = clientPort.createSignal("testSignal", { id: "signal-1" });
      const clientSignal2 = clientPort.createSignal("testSignal", { id: "signal-2" });

      const received1: number[] = [];
      const received2: number[] = [];

      clientSignal1.subscribe(v => {
        if (isAvailable(v)) received1.push(v.value);
      });
      clientSignal2.subscribe(v => {
        if (isAvailable(v)) received2.push(v.value);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Both should have initial values
      expect(received1).toContain(10);
      expect(received2).toContain(20);

      // Disconnect
      simulateDisconnect();
      expect(clientSignal1.hasError()).toBe(true);
      expect(clientSignal2.hasError()).toBe(true);

      // Reconnect
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Both should be recovered
      expect(clientSignal1.hasError()).toBe(false);
      expect(clientSignal2.hasError()).toBe(false);

      // Update both signals
      setServerSignal1({ value: 11 });
      setServerSignal2({ value: 21 });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Both should receive new values
      expect(received1).toContain(11);
      expect(received2).toContain(21);
    });
  });

  describe("Pull Behavior", () => {
    it("should hang on .pull() while disconnected and resolve after reconnect", async () => {
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify pull works normally when connected
      expect(await clientSignal.pull()).toEqual({ value: 0 });

      // Disconnect
      simulateDisconnect();

      // Update server value while disconnected
      setServerSignal({ value: 999 });

      // Start a pull - it should hang while disconnected
      let pullResolved = false;
      let pullResult: { value: number } | undefined;
      const pullPromise = clientSignal.pull().then(result => {
        pullResolved = true;
        pullResult = result;
        return result;
      });

      // Give it a tick - pull should NOT have resolved
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(pullResolved).toBe(false);

      // Reconnect - pull should now resolve with the latest value
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Wait for pull to complete
      await pullPromise;

      expect(pullResolved).toBe(true);
      expect(pullResult).toEqual({ value: 999 });
    });

    it("should resolve multiple pending .pull() calls after reconnect", async () => {
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Disconnect
      simulateDisconnect();

      // Update server value
      setServerSignal({ value: 42 });

      // Start multiple pulls - they should all hang
      const pull1 = clientSignal.pull();
      const pull2 = clientSignal.pull();
      const pull3 = clientSignal.pull();

      // Give it a tick - none should have resolved
      await new Promise(resolve => setTimeout(resolve, 0));

      // Reconnect
      simulateReconnect();

      // All pulls should resolve with the same latest value
      const [result1, result2, result3] = await Promise.all([pull1, pull2, pull3]);

      expect(result1).toEqual({ value: 42 });
      expect(result2).toEqual({ value: 42 });
      expect(result3).toEqual({ value: 42 });
    });
  });

  describe("Edge Cases", () => {
    it("should handle immediate reconnect after disconnect", async () => {
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const receivedValues: number[] = [];
      clientSignal.subscribe(value => {
        if (isAvailable(value)) {
          receivedValues.push(value.value);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Immediate disconnect and reconnect (no async delay between)
      simulateDisconnect();
      simulateReconnect();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should be recovered
      expect(clientSignal.hasError()).toBe(false);

      // Should receive updates
      setServerSignal({ value: 42 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(receivedValues).toContain(42);
    });

    it("should reconnect via ensureConnectedOrStartConnection", async () => {
      const [serverSignal, setServerSignal] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      });

      backendInterface.handleSignalEndpoint("testSignal", () => serverSignal);

      const { clientPort, simulateDisconnect, isConnected } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const clientSignal = clientPort.createSignal("testSignal", { id: "test-1" });
      const receivedValues: number[] = [];
      clientSignal.subscribe(value => {
        if (isAvailable(value)) {
          receivedValues.push(value.value);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Disconnect
      simulateDisconnect();
      expect(isConnected()).toBe(false);

      // Use ensureConnectedOrStartConnection instead of simulateReconnect
      clientPort.ensureConnectedOrStartConnection();
      expect(isConnected()).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Signal should be recovered
      expect(clientSignal.hasError()).toBe(false);

      // Should receive updates
      setServerSignal({ value: 99 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(receivedValues).toContain(99);
    });
  });
});
