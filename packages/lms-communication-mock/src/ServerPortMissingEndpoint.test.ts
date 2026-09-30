import { BufferedEvent, SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import {
  BackendInterface,
  ConnectionStatus,
  type ClientToServerMessage,
  type ServerToClientMessage,
} from "@lmstudio/lms-communication";
import { ClientPort, GenericClientTransport } from "@lmstudio/lms-communication-client";
import { GenericServerTransport, ServerPort } from "@lmstudio/lms-communication-server";
import { z } from "zod";

const silentLogger: LoggerInterface = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** Real client requests must settle even when the server cannot serve their endpoints. */
test.each([false, true])("rejects missing endpoint handlers (registered=%s)", async registered => {
  const clientInterface = new BackendInterface()
    .addRpcEndpoint("healthy", { parameter: z.void(), returns: z.string() })
    .addRpcEndpoint("missingRpc", { parameter: z.void(), returns: z.void() })
    .addChannelEndpoint("missingChannel", {
      creationParameter: z.void(),
      toClientPacket: z.void(),
      toServerPacket: z.void(),
    })
    .addSignalEndpoint("missingSignal", { creationParameter: z.void(), signalData: z.string() })
    .addWritableSignalEndpoint("missingWritable", {
      creationParameter: z.void(),
      signalData: z.string(),
    });
  const serverInterface = new BackendInterface().addRpcEndpoint(
    "healthy",
    clientInterface.getRpcEndpoint("healthy")!,
  );
  serverInterface.handleRpcEndpoint("healthy", () => "still connected");
  if (registered) {
    serverInterface.addRpcEndpoint("missingRpc", clientInterface.getRpcEndpoint("missingRpc")!);
    serverInterface.addChannelEndpoint(
      "missingChannel",
      clientInterface.getChannelEndpoint("missingChannel")!,
    );
    serverInterface.addSignalEndpoint(
      "missingSignal",
      clientInterface.getSignalEndpoint("missingSignal")!,
    );
    serverInterface.addWritableSignalEndpoint(
      "missingWritable",
      clientInterface.getWritableSignalEndpoint("missingWritable")!,
    );
  }

  // Different interfaces reproduce a client calling APIs that its peer does not provide.
  const [toClient, sendToClient] = BufferedEvent.create<ServerToClientMessage>();
  const [toServer, sendToServer] = BufferedEvent.create<ClientToServerMessage>();
  const [clientClosed] = BufferedEvent.create<void>();
  const [serverClosed] = BufferedEvent.create<void>();
  const replies = jest.fn(sendToClient);
  const server = new ServerPort(
    serverInterface,
    /** Request contexts use a silent logger because errors are asserted through the client. */
    () => ({ logger: new SimpleLogger("Missing endpoint test", silentLogger) }),
    GenericServerTransport.createFactory(toServer, serverClosed, replies),
    { parentLogger: silentLogger },
  );
  const client = new ClientPort(
    clientInterface,
    GenericClientTransport.createFactory(toClient, clientClosed, sendToServer),
    { parentLogger: silentLogger },
  );
  const onClose = jest.fn();
  server.closeEvent.subscribe(onClose);
  const reason = registered ? "Unhandled" : "Unknown";

  // Repeat every request so every error kind is exercised after the five-warning cap.
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(client.callRpc("missingRpc", undefined)).rejects.toThrow(
      `${reason} RPC endpoint 'missingRpc'`,
    );
    const channel = client.createChannel("missingChannel", undefined);
    const channelError = await new Promise<Error>(resolve =>
      channel.onError.subscribeOnce(resolve),
    );
    expect(channelError.message).toContain(`${reason} channel endpoint 'missingChannel'`);
    expect(channel.connectionStatus.get()).toBe(ConnectionStatus.Errored);

    for (const [signal, endpoint] of [
      [client.createSignal("missingSignal", undefined), "signal endpoint 'missingSignal'"],
      [
        client.createWritableSignal("missingWritable", undefined)[0],
        "writable signal endpoint 'missingWritable'",
      ],
    ] as const) {
      const unsubscribe = signal.subscribe(() => {});
      try {
        const error = await signal.errorSignal.until(error => error !== null);
        expect(error?.message).toContain(`${reason} ${endpoint}`);
        expect(signal.hasError()).toBe(true);
      } finally {
        unsubscribe();
      }
    }
  }

  const packets = replies.mock.calls.map(([message]) => message);
  for (const type of ["rpcError", "channelError", "signalError", "writableSignalError"]) {
    expect(packets.filter(packet => packet.type === type)).toHaveLength(3);
  }
  expect(packets.filter(packet => packet.type === "communicationWarning")).toHaveLength(5);
  expect(onClose).not.toHaveBeenCalled();
  await expect(client.callRpc("healthy", undefined)).resolves.toBe("still connected");
});
