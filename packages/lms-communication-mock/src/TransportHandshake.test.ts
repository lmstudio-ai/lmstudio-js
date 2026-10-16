import { BufferedEvent, SimpleLogger } from "@lmstudio/lms-common";
import { BackendInterface, type ClientTransport } from "@lmstudio/lms-communication";
import { ClientPort, GenericClientTransport } from "@lmstudio/lms-communication-client";
import { GenericServerTransport, ServerPort } from "@lmstudio/lms-communication-server";
import { z } from "zod";

const logger = new SimpleLogger("Handshake test", {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});
const metadataSchema = z.object({ name: z.string() });

/** Metadata must arrive before handlers run, and a later keepalive cannot change the peer identity. */
test.each([true, false])("exchanges metadata once (keepalive first: %s)", async keepaliveFirst => {
  const [toServer, emitToServer] = BufferedEvent.create<unknown>();
  const [toClient, emitToClient] = BufferedEvent.create<unknown>();
  const [serverClosed, emitServerClosed] = BufferedEvent.create<void>();
  const [clientClosed] = BufferedEvent.create<void>();
  let serverPeer: string | undefined;
  let clientPeer: string | undefined;
  const serverHandshake = jest.fn((metadata: { name: string } | undefined) => {
    serverPeer = metadata?.name;
  });
  const clientHandshake = jest.fn((metadata: { name: string } | undefined) => {
    clientPeer = metadata?.name;
  });
  const backend = new BackendInterface().addRpcEndpoint("peer", {
    parameter: z.void(),
    returns: z.string(),
  });
  backend.handleRpcEndpoint("peer", () => serverPeer ?? "legacy");
  const server = new ServerPort(
    backend,
    () => ({ logger }),
    GenericServerTransport.createFactory(
      toServer,
      serverClosed,
      message => emitToClient(JSON.parse(JSON.stringify(message))),
      { handshake: { schema: metadataSchema, value: { name: "server" }, onPeer: serverHandshake } },
    ),
    { parentLogger: logger },
  );
  const factory = GenericClientTransport.createFactory(
    toClient,
    clientClosed,
    message => emitToServer(JSON.parse(JSON.stringify(message))),
    { handshake: { schema: metadataSchema, value: { name: "client" }, onPeer: clientHandshake } },
  );
  let transport!: ClientTransport;
  const client = new ClientPort(backend, (...args) => (transport = factory(...args)), {
    parentLogger: logger,
  });
  try {
    if (keepaliveFirst) transport.send({ type: "keepAlive" });
    expect(await client.callRpc("peer", undefined)).toBe(keepaliveFirst ? "client" : "legacy");
    expect(clientPeer).toBe(keepaliveFirst ? "server" : undefined);
    emitToServer({ type: "keepAlive", metadata: { name: "changed" } });
    emitToClient({ type: "keepAliveAck", metadata: { name: "changed" } });
    expect(await client.callRpc("peer", undefined)).toBe(keepaliveFirst ? "client" : "legacy");
    expect(clientPeer).toBe(keepaliveFirst ? "server" : undefined);
    expect(serverHandshake).toHaveBeenCalledTimes(1);
    expect(clientHandshake).toHaveBeenCalledTimes(1);
  } finally {
    emitServerClosed();
    await client[Symbol.asyncDispose]();
    await server[Symbol.asyncDispose]();
  }
});

/** A protocol failure ends the connection in both directions, even before its owner closes it. */
test.each([
  ["client", "envelope"],
  ["client", "metadata"],
  ["server", "envelope"],
  ["server", "metadata"],
] as const)("fails a %s transport on an invalid %s", async (side, invalid) => {
  const [incoming, emitIncoming] = BufferedEvent.create<unknown>();
  const [closed, emitClosed] = BufferedEvent.create<void>();
  const received = jest.fn();
  const failed = jest.fn();
  const onPeer = jest.fn();
  const opts = { handshake: { schema: metadataSchema, value: { name: "local" }, onPeer } };
  const transport =
    side === "server"
      ? new GenericServerTransport(incoming, closed, () => {}, received, failed, logger, opts)
      : new GenericClientTransport(
          incoming,
          closed,
          () => {},
          received,
          () => {},
          failed,
          logger,
          opts,
        );
  const type = side === "server" ? "keepAlive" : "keepAliveAck";
  emitIncoming({
    type: invalid === "envelope" ? "invalid" : type,
    metadata: { name: invalid === "metadata" ? 42 : "peer" },
  });
  emitIncoming({ type, metadata: { name: "peer" } });
  await new Promise(resolve => setImmediate(resolve));
  expect(() => {
    if (transport instanceof GenericServerTransport) {
      transport.send({ type: "keepAliveAck" });
    } else {
      transport.send({ type: "keepAlive" });
    }
  }).toThrow("closed");
  emitClosed();
  await new Promise(resolve => setImmediate(resolve));
  expect(failed).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  expect(onPeer).not.toHaveBeenCalled();
  expect(received).not.toHaveBeenCalled();
  await transport[Symbol.asyncDispose]();
});

/** A closed connection must reject later RPCs and expose errors on newly subscribed signals. */
test.each(["metadata", "envelope", "close"] as const)(
  "rejects pending and subsequent client work after %s failure",
  async failure => {
    const [incoming, emitIncoming] = BufferedEvent.create<unknown>();
    const [closed, emitClosed] = BufferedEvent.create<void>();
    const backend = new BackendInterface()
      .addRpcEndpoint("echo", { parameter: z.string(), returns: z.string() })
      .addSignalEndpoint("state", { creationParameter: z.void(), signalData: z.string() })
      .addWritableSignalEndpoint("writable", {
        creationParameter: z.void(),
        signalData: z.string(),
      });
    const client = new ClientPort(
      backend,
      GenericClientTransport.createFactory(incoming, closed, () => {}, {
        handshake: { schema: metadataSchema, value: { name: "client" }, onPeer: () => {} },
      }),
      { parentLogger: logger },
    );
    const request = client.callRpc("echo", "pending");
    if (failure === "close") {
      emitClosed();
    } else {
      emitIncoming(
        failure === "metadata" ? { type: "keepAliveAck", metadata: null } : { type: "invalid" },
      );
    }
    await expect(request).rejects.toThrow();
    await expect(client.callRpc("echo", "after failure")).rejects.toThrow("closed");
    // pull() waits for recovery; subscription failures are exposed through errorSignal.
    const signal = client.createSignal("state", undefined);
    const [writable] = client.createWritableSignal("writable", undefined);
    const stopSignal = signal.subscribe(() => {});
    const stopWritable = writable.subscribe(() => {});
    try {
      expect(signal.errorSignal.get()?.message).toContain("closed");
      expect(writable.errorSignal.get()?.message).toContain("closed");
    } finally {
      stopSignal();
      stopWritable();
      await client[Symbol.asyncDispose]();
    }
  },
);
