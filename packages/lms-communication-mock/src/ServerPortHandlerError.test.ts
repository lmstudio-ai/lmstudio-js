import { BufferedEvent, SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import { BackendInterface, ConnectionStatus } from "@lmstudio/lms-communication";
import { ClientPort, GenericClientTransport } from "@lmstudio/lms-communication-client";
import {
  GenericServerTransport,
  ServerPort,
  type Context,
  type ContextCreator,
} from "@lmstudio/lms-communication-server";
import { z } from "zod";
import { createMockedPorts } from "./createMockedPorts.js";

const silentLogger: LoggerInterface = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function createTestContextCreator(): ContextCreator<Context> {
  return params => ({
    logger: new SimpleLogger(`Test:${params.endpointName}`, silentLogger),
  });
}

describe("ServerPort handler errors", () => {
  /** Null failures must reach the caller whether they came from a handler or an error mapper. */
  test.each(["handler", "mapper"] as const)("propagates null from the %s", async source => {
    const logger = new SimpleLogger("null error", silentLogger);
    const [toServer, emitToServer] = BufferedEvent.create();
    const [toClient, emitToClient] = BufferedEvent.create();
    const [serverClosed] = BufferedEvent.create<void>();
    const [clientClosed] = BufferedEvent.create<void>();
    const backend = new BackendInterface().addRpcEndpoint("fail", {
      parameter: z.void(),
      returns: z.void(),
    });
    backend.handleRpcEndpoint("fail", () => {
      throw source === "handler" ? null : new Error("original");
    });
    const server = new ServerPort(
      backend,
      createTestContextCreator(),
      GenericServerTransport.createFactory(toServer, serverClosed, emitToClient),
      { parentLogger: logger, mapError: source === "mapper" ? () => null : undefined },
    );
    const client = new ClientPort(
      backend,
      GenericClientTransport.createFactory(toClient, clientClosed, emitToServer),
      { parentLogger: logger },
    );
    try {
      await expect(client.callRpc("fail", undefined)).rejects.toThrow("null");
    } finally {
      await client[Symbol.asyncDispose]();
      await server[Symbol.asyncDispose]();
    }
  });

  it("propagates sync rpc handler errors", async () => {
    const backendInterface = new BackendInterface().addRpcEndpoint("testRpc", {
      parameter: z.object({ value: z.number() }),
      returns: z.object({ value: z.number() }),
    });
    backendInterface.handleRpcEndpoint("testRpc", () => {
      throw new Error("sync rpc boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());

    await expect(clientPort.callRpc("testRpc", { value: 1 })).rejects.toThrow("sync rpc boom");
  });

  it("propagates async rpc handler errors", async () => {
    const backendInterface = new BackendInterface().addRpcEndpoint("testRpc", {
      parameter: z.object({ value: z.number() }),
      returns: z.object({ value: z.number() }),
    });
    backendInterface.handleRpcEndpoint("testRpc", async () => {
      await Promise.resolve();
      throw new Error("async rpc boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());

    await expect(clientPort.callRpc("testRpc", { value: 1 })).rejects.toThrow("async rpc boom");
  });

  it("propagates sync channel handler errors", async () => {
    const backendInterface = new BackendInterface().addChannelEndpoint("testChannel", {
      creationParameter: z.object({ id: z.string() }),
      toServerPacket: z.object({ message: z.string() }),
      toClientPacket: z.object({ message: z.string() }),
    });
    backendInterface.handleChannelEndpoint("testChannel", () => {
      throw new Error("sync channel boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());
    const channel = clientPort.createChannel("testChannel", { id: "1" });

    const error = await new Promise<Error>(resolve => {
      channel.onError.subscribe(resolve);
    });

    expect(error.message).toBe("sync channel boom");
    expect(channel.connectionStatus.get()).toBe(ConnectionStatus.Errored);
  });

  it("propagates async channel handler errors", async () => {
    const backendInterface = new BackendInterface().addChannelEndpoint("testChannel", {
      creationParameter: z.object({ id: z.string() }),
      toServerPacket: z.object({ message: z.string() }),
      toClientPacket: z.object({ message: z.string() }),
    });
    backendInterface.handleChannelEndpoint("testChannel", async () => {
      await Promise.resolve();
      throw new Error("async channel boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());
    const channel = clientPort.createChannel("testChannel", { id: "1" });

    const error = await new Promise<Error>(resolve => {
      channel.onError.subscribe(resolve);
    });

    expect(error.message).toBe("async channel boom");
    expect(channel.connectionStatus.get()).toBe(ConnectionStatus.Errored);
  });

  it("propagates sync signal handler errors", async () => {
    const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
      creationParameter: z.object({ id: z.string() }),
      signalData: z.object({ value: z.number() }),
    });
    backendInterface.handleSignalEndpoint("testSignal", () => {
      throw new Error("sync signal boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());
    const signal = clientPort.createSignal("testSignal", { id: "1" });

    const errorPromise = new Promise<Error>(resolve => {
      const unsubscribe = signal.errorSignal.subscribe(error => {
        if (error) {
          unsubscribe();
          resolve(error);
        }
      });
    });

    signal.subscribe(() => {});

    const error = await errorPromise;
    expect(error.message).toBe("sync signal boom");
    expect(signal.hasError()).toBe(true);
  });

  it("propagates async signal handler errors", async () => {
    const backendInterface = new BackendInterface().addSignalEndpoint("testSignal", {
      creationParameter: z.object({ id: z.string() }),
      signalData: z.object({ value: z.number() }),
    });
    backendInterface.handleSignalEndpoint("testSignal", async () => {
      await Promise.resolve();
      throw new Error("async signal boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());
    const signal = clientPort.createSignal("testSignal", { id: "1" });

    const errorPromise = new Promise<Error>(resolve => {
      const unsubscribe = signal.errorSignal.subscribe(error => {
        if (error) {
          unsubscribe();
          resolve(error);
        }
      });
    });

    signal.subscribe(() => {});

    const error = await errorPromise;
    expect(error.message).toBe("async signal boom");
    expect(signal.hasError()).toBe(true);
  });

  it("propagates sync writable signal handler errors", async () => {
    const backendInterface = new BackendInterface().addWritableSignalEndpoint(
      "testWritableSignal",
      {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      },
    );
    backendInterface.handleWritableSignalEndpoint("testWritableSignal", () => {
      throw new Error("sync writable signal boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());
    const [signal] = clientPort.createWritableSignal("testWritableSignal", { id: "1" });

    const errorPromise = new Promise<Error>(resolve => {
      const unsubscribe = signal.errorSignal.subscribe(error => {
        if (error) {
          unsubscribe();
          resolve(error);
        }
      });
    });

    signal.subscribe(() => {});

    const error = await errorPromise;
    expect(error.message).toBe("sync writable signal boom");
    expect(signal.hasError()).toBe(true);
  });

  it("propagates async writable signal handler errors", async () => {
    const backendInterface = new BackendInterface().addWritableSignalEndpoint(
      "testWritableSignal",
      {
        creationParameter: z.object({ id: z.string() }),
        signalData: z.object({ value: z.number() }),
      },
    );
    backendInterface.handleWritableSignalEndpoint("testWritableSignal", async () => {
      await Promise.resolve();
      throw new Error("async writable signal boom");
    });

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());
    const [signal] = clientPort.createWritableSignal("testWritableSignal", { id: "1" });

    const errorPromise = new Promise<Error>(resolve => {
      const unsubscribe = signal.errorSignal.subscribe(error => {
        if (error) {
          unsubscribe();
          resolve(error);
        }
      });
    });

    signal.subscribe(() => {});

    const error = await errorPromise;
    expect(error.message).toBe("async writable signal boom");
    expect(signal.hasError()).toBe(true);
  });
});
