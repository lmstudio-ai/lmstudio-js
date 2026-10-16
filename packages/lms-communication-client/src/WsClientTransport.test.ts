import { makePromise, SimpleLogger } from "@lmstudio/lms-common";
import { BackendInterface, PayloadCodec, type PayloadSchema } from "@lmstudio/lms-communication";
import {
  AuthenticatedWsClientTransport,
  ClientPort,
  WsClientTransport,
} from "@lmstudio/lms-communication-client";
import { once } from "events";
import { WebSocketServer } from "ws";
import { z } from "zod";

const logger = new SimpleLogger("", { debug() {}, error() {}, info() {}, warn() {} });
const servers: WebSocketServer[] = [];
const disposables = new Set<{ [Symbol.asyncDispose](): Promise<void> }>();
const backend = new BackendInterface().addRpcEndpoint("echo", {
  parameter: z.string(),
  returns: z.unknown(),
});

/** Closes real sockets even when a regression leaves a request pending. */
afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const socket of server.clients) {
      socket.terminate();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  for (const disposable of disposables) {
    await disposable[Symbol.asyncDispose]();
  }
  disposables.clear();
});

/** Echoes wire payloads so tests can inspect what actually crossed the connection. */
async function startServer({ authenticate = false, rejectFirstConnection = false } = {}) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  servers.push(server);
  const received: unknown[] = [];
  let connections = 0;
  server.on("connection", socket => {
    connections++;
    /** Installs application handlers only after authentication succeeds. */
    const listen = () => {
      socket.on("message", data => {
        const message = z
          .discriminatedUnion("type", [
            z.object({
              type: z.literal("rpcCall"),
              endpoint: z.string(),
              callId: z.number(),
              parameter: z.unknown(),
            }),
            z.object({ type: z.literal("keepAlive"), metadata: z.unknown().optional() }),
            z.object({
              type: z.enum(["signalSubscribe", "writableSignalSubscribe"]),
              subscribeId: z.number(),
              endpoint: z.string(),
              creationParameter: z.unknown(),
            }),
            z.object({
              type: z.enum(["signalUnsubscribe", "writableSignalUnsubscribe"]),
              subscribeId: z.number(),
            }),
          ])
          .parse(JSON.parse(data.toString()));
        received.push(message);
        if (message.type === "rpcCall") {
          socket.send(
            JSON.stringify({
              type: "rpcResult",
              callId: message.callId,
              result: message.parameter,
            }),
          );
        } else if (message.type === "keepAlive") {
          socket.send(JSON.stringify({ type: "keepAliveAck", metadata: message.metadata }));
        } else if (
          message.type === "signalSubscribe" ||
          message.type === "writableSignalSubscribe"
        ) {
          socket.send(
            JSON.stringify({
              type: message.type === "signalSubscribe" ? "signalUpdate" : "writableSignalUpdate",
              subscribeId: message.subscribeId,
              patches: [{ op: "replace", path: [], value: "ready" }],
              tags: [],
            }),
          );
        }
      });
    };
    if (authenticate) {
      socket.once("message", data => {
        expect(JSON.parse(data.toString())).toEqual({
          authVersion: 1,
          clientIdentifier: "test-client",
          clientPasskey: "test-key",
        });
        if (rejectFirstConnection && connections === 1) {
          socket.send(JSON.stringify({ success: false, error: "Rejected first connection" }));
          return;
        }
        listen();
        socket.send(JSON.stringify({ success: true }));
      });
    } else {
      listen();
    }
  });
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string") {
    throw new Error("Expected a TCP address");
  }
  return { url: `ws://127.0.0.1:${address.port}`, received };
}

/** Queued RPCs use the connection's codec state, including after authentication. */
test.each([false, true])(
  "uses the connection's codec state (authenticated=%s)",
  async authenticate => {
    const { url } = await startServer({ authenticate });
    let connection = 1;
    const codec = new (class extends PayloadCodec {
      /** Makes the chosen connection visible in the echoed payload. */
      public override toWire<TValue>(_schema: PayloadSchema<TValue>, value: TValue): unknown {
        if (value === "invalid") {
          throw new Error("Cannot encode this request");
        }
        return { connection, value };
      }
    })();
    const factory = authenticate
      ? AuthenticatedWsClientTransport.createAuthenticatedWsClientTransportFactory({
          url,
          clientIdentifier: "test-client",
          clientPasskey: "test-key",
        })
      : WsClientTransport.createWsClientTransportFactory(url);
    const client = new ClientPort(
      backend,
      (received, connected, errored, parentLogger) =>
        factory(
          received,
          () => {
            connection = 2;
            connected();
          },
          errored,
          parentLogger,
        ),
      { payloadCodec: codec, parentLogger: logger },
    );
    disposables.add(client);
    const invalid = expect(client.callRpc("echo", "invalid")).rejects.toThrow("Cannot encode");
    const first = client.callRpc("echo", "first");
    const second = client.callRpc("echo", "second");
    await invalid;
    await expect(Promise.all([first, second])).resolves.toEqual([
      { connection: 2, value: "first" },
      { connection: 2, value: "second" },
    ]);
  },
);

/** Direct envelopes retain their order; canceled work never reaches the server. */
test("cancels queued preparation without reordering other sends", async () => {
  const { url, received } = await startServer();
  const finished = makePromise<void>();
  const transport = WsClientTransport.createWsClientTransportFactory(url)(
    message => {
      if (message.type === "keepAliveAck" && message.metadata === "last") {
        finished.resolve();
      }
    },
    () => {},
    finished.reject,
    logger,
  );
  disposables.add(transport);
  let canceled = false;
  transport.send({ type: "keepAlive", metadata: "first" });
  transport.sendDeferred(
    () => (canceled ? null : { type: "keepAlive", metadata: "canceled" }),
    finished.reject,
  );
  transport.sendDeferred(() => ({ type: "keepAlive", metadata: "last" }), finished.reject);
  canceled = true;
  await finished.promise;
  expect(received).toEqual([
    { type: "keepAlive", metadata: "first" },
    { type: "keepAlive", metadata: "last" },
  ]);
});

/** Failed authentication settles queued sends and cannot replay them on the next connection. */
test("reconnects after authentication failure without replaying failed work", async () => {
  const { url, received } = await startServer({ authenticate: true, rejectFirstConnection: true });
  const first = makePromise<void>();
  const second = makePromise<void>();
  const transport = AuthenticatedWsClientTransport.createAuthenticatedWsClientTransportFactory({
    url,
    clientIdentifier: "test-client",
    clientPasskey: "test-key",
  })(
    message => {
      if (message.type === "keepAliveAck" && message.metadata === "second") {
        second.resolve();
      }
    },
    () => {},
    () => {},
    logger,
  );
  disposables.add(transport);
  transport.send({ type: "keepAlive", metadata: "failed-direct" });
  transport.sendDeferred(() => ({ type: "keepAlive", metadata: "first" }), first.reject);
  await expect(first.promise).rejects.toThrow("Rejected first connection");
  transport.sendDeferred(() => ({ type: "keepAlive", metadata: "second" }), second.reject);
  await second.promise;
  expect(received).toEqual([{ type: "keepAlive", metadata: "second" }]);
});

/** Failures before a socket exists must settle deferred work too. */
test.each(["rejected URL", "invalid URL", "aborted"] as const)(
  "fails queued work for %s",
  async failure => {
    const url = makePromise<string>();
    const abortController = new AbortController();
    const transport = WsClientTransport.createWsClientTransportFactory(url.promise, {
      abortSignal: abortController.signal,
    })(
      () => {},
      () => {},
      () => {},
      logger,
    );
    disposables.add(transport);
    const result = makePromise<void>();
    transport.sendDeferred(() => ({ type: "keepAlive" }), result.reject);
    const rejected = expect(result.promise).rejects.toBeInstanceOf(Error);
    if (failure === "rejected URL") {
      url.reject(new Error("Cannot resolve URL"));
    } else if (failure === "invalid URL") {
      url.resolve("not a websocket URL");
    } else {
      abortController.abort(new Error("Connection aborted"));
      url.resolve("ws://127.0.0.1:1");
    }
    await rejected;
  },
);

/** Port-level failure must keep queued subscriptions recoverable. */
test.each([false, true])(
  "recovers a queued signal after reconnect (writable=%s)",
  async writable => {
    const { url } = await startServer({ authenticate: true, rejectFirstConnection: true });
    const signalBackend = new BackendInterface()
      .addSignalEndpoint("state", { creationParameter: z.void(), signalData: z.string() })
      .addWritableSignalEndpoint("writableState", {
        creationParameter: z.void(),
        signalData: z.string(),
      });
    const client = new ClientPort(
      signalBackend,
      AuthenticatedWsClientTransport.createAuthenticatedWsClientTransportFactory({
        url,
        clientIdentifier: "test-client",
        clientPasskey: "test-key",
      }),
      { parentLogger: logger },
    );
    disposables.add(client);
    const signal = writable
      ? client.createWritableSignal("writableState", undefined)[0]
      : client.createSignal("state", undefined);
    const failed = makePromise<void>();
    const stopErrors = signal.errorSignal.subscribe(error => {
      if (error !== undefined) {
        failed.resolve();
      }
    });
    try {
      const pending = signal.pull();
      await failed.promise;
      client.ensureConnectedOrStartConnection();
      await expect(pending).resolves.toBe("ready");
      expect(signal.hasError()).toBe(false);
    } finally {
      stopErrors();
    }
  },
);

/** Disposal waits for queued RPCs to either complete or fail with their connection. */
test.each([false, true])(
  "settles queued RPCs during disposal (connection fails=%s)",
  async rejectFirstConnection => {
    const { url } = await startServer({ authenticate: true, rejectFirstConnection });
    const client = new ClientPort(
      backend,
      AuthenticatedWsClientTransport.createAuthenticatedWsClientTransportFactory({
        url,
        clientIdentifier: "test-client",
        clientPasskey: "test-key",
      }),
      { parentLogger: logger },
    );
    const result = client.callRpc("echo", "pending");
    const disposed = client[Symbol.asyncDispose]();
    if (rejectFirstConnection) {
      await expect(result).rejects.toThrow("Rejected first connection");
    } else {
      await expect(result).resolves.toBe("pending");
    }
    await disposed;
  },
);
