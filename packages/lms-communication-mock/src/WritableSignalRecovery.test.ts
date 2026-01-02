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

describe("Writable Signal Recovery", () => {
  describe("Basic Recovery", () => {
    it("should recover writable signal after transport disconnect and reconnect", async () => {
      const [serverSignal, serverSetter] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addWritableSignalEndpoint(
        "testWritableSignal",
        {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        },
      );

      backendInterface.handleWritableSignalEndpoint("testWritableSignal", () => {
        return [serverSignal, serverSetter] as const;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const [clientSignal] = clientPort.createWritableSignal("testWritableSignal", {
        id: "test-1",
      });
      const receivedValues: number[] = [];
      clientSignal.subscribe(value => {
        if (isAvailable(value)) {
          receivedValues.push(value.value);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      // Update server signal
      serverSetter({ value: 1 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(receivedValues).toContain(1);

      // Disconnect
      simulateDisconnect();
      expect(clientSignal.hasError()).toBe(true);

      // Reconnect
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should be recovered
      expect(clientSignal.hasError()).toBe(false);

      // Update after recovery
      serverSetter({ value: 2 });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should receive new value
      expect(receivedValues).toContain(2);
    });

    it("should receive latest server value on reconnect without server re-emitting", async () => {
      const [serverSignal, serverSetter] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addWritableSignalEndpoint(
        "testWritableSignal",
        {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        },
      );

      backendInterface.handleWritableSignalEndpoint("testWritableSignal", () => {
        return [serverSignal, serverSetter] as const;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const [clientSignal] = clientPort.createWritableSignal("testWritableSignal", {
        id: "test-1",
      });
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
      serverSetter({ value: 100 });
      serverSetter({ value: 200 });
      serverSetter({ value: 300 });

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

  describe("Write Operations", () => {
    it("should allow writes after recovery", async () => {
      const [serverSignal, serverSetter] = Signal.create({ value: 0 });
      const serverReceivedValues: number[] = [];

      // Track what values the server receives from client writes
      serverSignal.subscribe(v => {
        serverReceivedValues.push(v.value);
      });

      const backendInterface = new BackendInterface().addWritableSignalEndpoint(
        "testWritableSignal",
        {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        },
      );

      backendInterface.handleWritableSignalEndpoint("testWritableSignal", () => {
        return [serverSignal, serverSetter] as const;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const [clientSignal, clientSetter] = clientPort.createWritableSignal("testWritableSignal", {
        id: "test-1",
      });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Write before disconnect
      clientSetter({ value: 100 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(serverReceivedValues).toContain(100);

      // Disconnect and reconnect
      simulateDisconnect();
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Write after recovery
      clientSetter({ value: 200 });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Server should have received the write after recovery
      expect(serverReceivedValues).toContain(200);
    });
  });

  describe("Error Signal", () => {
    it("should emit errors on writable errorSignal and clear after recovery", async () => {
      const [serverSignal, serverSetter] = Signal.create({ value: 0 });

      const backendInterface = new BackendInterface().addWritableSignalEndpoint(
        "testWritableSignal",
        {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        },
      );

      backendInterface.handleWritableSignalEndpoint("testWritableSignal", () => {
        return [serverSignal, serverSetter] as const;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const [clientSignal] = clientPort.createWritableSignal("testWritableSignal", {
        id: "test-1",
      });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      const errors: Array<Error | null> = [];
      clientSignal.errorSignal.subscribe(error => {
        errors.push(error);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clientSignal.errorSignal.get()).toBe(null);

      simulateDisconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clientSignal.errorSignal.get()).not.toBe(null);
      expect(clientSignal.errorSignal.get()).toBeInstanceOf(Error);

      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clientSignal.errorSignal.get()).toBe(null);
      // Ensure subscription still works after recovery
      serverSetter({ value: 1 });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(isAvailable(clientSignal.get())).toBe(true);
    });

    it("should clear in-flight writes when disconnect happens before confirmation", async () => {
      const [serverSignal, serverSetter] = Signal.create({ value: 0 });
      const serverValues: number[] = [];
      serverSignal.subscribe(value => {
        serverValues.push(value.value);
      });

      const backendInterface = new BackendInterface().addWritableSignalEndpoint(
        "testWritableSignal",
        {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        },
      );

      backendInterface.handleWritableSignalEndpoint("testWritableSignal", () => {
        return [serverSignal, serverSetter] as const;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const [clientSignal, clientSetter] = clientPort.createWritableSignal("testWritableSignal", {
        id: "test-1",
      });
      clientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      clientSetter({ value: 1 });
      simulateDisconnect();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clientSignal.hasError()).toBe(true);
      expect(clientSignal.errorSignal.get()).toBeInstanceOf(Error);

      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(clientSignal.hasError()).toBe(false);
      expect(clientSignal.errorSignal.get()).toBe(null);

      // Ensure the client re-synchronizes with server state before issuing new writes
      serverSetter({ value: 10 });
      await new Promise(resolve => setTimeout(resolve, 0));

      clientSetter.withUpdater(({ value }) => ({ value: value + 1 }));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(serverValues).toContain(11);
      expect(clientSignal.get()).toEqual({ value: 11 });
    });
  });

  describe("Mixed Signal Types", () => {
    it("should recover both readonly and writable signals", async () => {
      const [readonlyServerSignal] = Signal.create({ value: 10 });
      const [writableServerSignal, writableSetter] = Signal.create({ value: 20 });

      const backendInterface = new BackendInterface()
        .addSignalEndpoint("readonlySignal", {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        })
        .addWritableSignalEndpoint("writableSignal", {
          creationParameter: z.object({ id: z.string() }),
          signalData: z.object({ value: z.number() }),
        });

      backendInterface.handleSignalEndpoint("readonlySignal", () => readonlyServerSignal);
      backendInterface.handleWritableSignalEndpoint("writableSignal", () => {
        return [writableServerSignal, writableSetter] as const;
      });

      const { clientPort, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
        backendInterface,
        createTestContextCreator(),
      );

      const readonlyClientSignal = clientPort.createSignal("readonlySignal", { id: "readonly-1" });
      const [writableClientSignal] = clientPort.createWritableSignal("writableSignal", {
        id: "writable-1",
      });

      readonlyClientSignal.subscribe(() => {});
      writableClientSignal.subscribe(() => {});

      await new Promise(resolve => setTimeout(resolve, 0));

      // Disconnect
      simulateDisconnect();
      expect(readonlyClientSignal.hasError()).toBe(true);
      expect(writableClientSignal.hasError()).toBe(true);

      // Reconnect
      simulateReconnect();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Both should be recovered
      expect(readonlyClientSignal.hasError()).toBe(false);
      expect(writableClientSignal.hasError()).toBe(false);
    });
  });
});
