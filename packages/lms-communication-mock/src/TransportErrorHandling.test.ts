import { SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import {
  BackendInterface,
  type ClientToServerMessage,
  ClientTransport,
  type ClientTransportFactory,
  type ServerToClientMessage,
  ServerTransport,
  type ServerTransportFactory,
} from "@lmstudio/lms-communication";
import { ClientPort } from "@lmstudio/lms-communication-client";
import { ServerPort, type Context, type ContextCreator } from "@lmstudio/lms-communication-server";
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

class ThrowingServerTransport extends ServerTransport {
  public constructor(private readonly receivedMessage: (message: ClientToServerMessage) => void) {
    super();
  }

  public trigger(message: ClientToServerMessage) {
    this.receivedMessage(message);
  }

  protected override sendViaTransport(_message: ServerToClientMessage): void {
    throw new Error("server send boom");
  }
}

class ThrowingClientTransport extends ClientTransport {
  public constructor(
    _receivedMessage: (message: ServerToClientMessage) => void,
    connected: () => void,
    _errored: (error: any) => void,
    _parentLogger: LoggerInterface,
  ) {
    super();
    connected();
  }

  protected override sendViaTransport(_message: ClientToServerMessage): void {
    throw new Error("client send boom");
  }
}

describe("Transport send error handling", () => {
  it("ServerPort.safeSend swallows transport send errors", () => {
    const backendInterface = new BackendInterface();
    const parentLogger: LoggerInterface = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    let transport: ThrowingServerTransport | undefined;
    const factory: ServerTransportFactory = (receivedMessage, _errored, _parentLogger) => {
      transport = new ThrowingServerTransport(receivedMessage);
      return transport;
    };

    new ServerPort(backendInterface, createTestContextCreator(), factory, {
      parentLogger,
    });

    expect(() => {
      transport!.trigger({ type: "keepAlive" });
    }).not.toThrow();

    expect(parentLogger.error).toHaveBeenCalled();
  });

  it("ClientPort.safeSend swallows transport send errors", () => {
    const backendInterface = new BackendInterface().addChannelEndpoint("testChannel", {
      creationParameter: z.object({ id: z.string() }),
      toServerPacket: z.object({ message: z.string() }),
      toClientPacket: z.object({ message: z.string() }),
    });

    const parentLogger: LoggerInterface = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const factory: ClientTransportFactory = (receivedMessage, connected, errored, parentLogger) =>
      new ThrowingClientTransport(receivedMessage, connected, errored, parentLogger);

    const clientPort = new ClientPort(backendInterface, factory, {
      parentLogger,
    });

    expect(() => {
      clientPort.createChannel("testChannel", { id: "channel-1" });
    }).not.toThrow();

    expect(parentLogger.error).toHaveBeenCalled();
  });

  it("RPC serialization errors are sent as rpcError", async () => {
    const throwOnSerializeSchema = z.any().transform(() => {
      const value: Record<string, unknown> = {};
      Object.defineProperty(value, "boom", {
        enumerable: true,
        get() {
          throw new Error("serialize boom");
        },
      });
      return value;
    });

    const backendInterface = new BackendInterface().addRpcEndpoint("testRpc", {
      parameter: z.object({ value: z.number() }),
      returns: z.any(),
      serialization: "superjson",
    });
    backendInterface.handleRpcEndpoint("testRpc", () => throwOnSerializeSchema.parse(null));

    const { clientPort } = createMockedPorts(backendInterface, createTestContextCreator());

    await expect(clientPort.callRpc("testRpc", { value: 1 })).rejects.toThrow("serialize boom");
  });
});
