import { BufferedEvent, SimpleLogger } from "@lmstudio/lms-common";
import {
  BackendInterface,
  toCloneablePDSFrame,
  type ParallelDataStreams,
  type PDSChunk,
  type PDSFrame,
} from "@lmstudio/lms-communication";
import { ClientPort, GenericClientTransport } from "@lmstudio/lms-communication-client";
import { GenericServerTransport, ServerPort } from "@lmstudio/lms-communication-server";
import { z } from "zod";

const logger = new SimpleLogger("PDS test", {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});
const identifierSchema = z.object({ pdsId: z.number().int() });
const backend = new BackendInterface()
  .withContextType<{ logger: SimpleLogger; pds: ParallelDataStreams }>()
  .addRpcEndpoint("relay", { parameter: identifierSchema, returns: identifierSchema })
  .addRpcEndpoint("ping", { parameter: z.void(), returns: z.string() });
backend.handleRpcEndpoint("relay", (ctx, identifier) => {
  const [writable, relayed] = ctx.pds.create();
  void ctx.pds
    .accept(identifier)
    .pipeTo(writable)
    .catch(() => {});
  return relayed;
});
backend.handleRpcEndpoint("ping", () => "pong");

/** With `overIpc`, everything goes through structured clone, as it does over Electron IPC. */
function connect(pdsSupported = true, overIpc = false) {
  const [toServer, emitToServerDirectly] = BufferedEvent.create<unknown>();
  const [toClient, emitToClientDirectly] = BufferedEvent.create<unknown>();
  const emitToServer = (message: unknown) =>
    emitToServerDirectly(overIpc ? structuredClone(message) : message);
  const emitToClient = (message: unknown) =>
    emitToClientDirectly(overIpc ? structuredClone(message) : message);
  const prepareFrame = (frame: PDSFrame) => (overIpc ? toCloneablePDSFrame(frame) : frame);
  const [serverClosed, emitServerClosed] = BufferedEvent.create<void>();
  const [clientClosed, emitClientClosed] = BufferedEvent.create<void>();
  const server = new ServerPort(
    backend,
    ({ pds }) => ({ logger, pds }),
    GenericServerTransport.createFactory(
      toServer,
      serverClosed,
      emitToClient,
      pdsSupported ? { sendPDSFrame: frame => emitToClient(prepareFrame(frame)) } : {},
    ),
    { parentLogger: logger },
  );
  const client = new ClientPort(
    backend,
    GenericClientTransport.createFactory(
      toClient,
      clientClosed,
      emitToServer,
      pdsSupported ? { sendPDSFrame: frame => emitToServer(prepareFrame(frame)) } : {},
    ),
    { parentLogger: logger },
  );
  const disconnect = () => {
    emitServerClosed();
    emitClientClosed();
  };
  return { client, server, disconnect };
}

async function readAll(readable: ReadableStream<PDSChunk>) {
  const chunks: Array<PDSChunk> = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return chunks;
}

afterEach(() => {
  jest.useRealTimers();
});

/** More frames than any starting allowance, so the test only finishes if credits flow. */
test("relays a stream through the server and back", async () => {
  const { client, disconnect } = connect();
  const sent: Array<PDSChunk> = [
    { data: new Uint8Array(100 * 1024).fill(1), compressed: false },
    ...Array.from({ length: 2500 }, (_, index) => ({
      data: new Uint8Array(1024).fill(index % 256),
      compressed: index % 2 === 0,
    })),
  ];
  const [writable, identifier] = client.pds.create();
  const writing = (async () => {
    const writer = writable.getWriter();
    for (const chunk of sent) {
      await writer.write(chunk);
    }
    await writer.close();
  })();
  const relayed = await client.callRpc("relay", identifier);
  expect(() => client.pds.accept(identifier)).toThrow("created on this side");
  const received = await readAll(client.pds.accept(relayed));
  await writing;

  // The large write arrives as two frames.
  expect(received[0].data.byteLength).toBe(64 * 1024);
  expect(received[1].data.byteLength).toBe(36 * 1024);
  expect(received.slice(2)).toEqual(sent.slice(1));
  disconnect();
});

/** Frames are plain data, so they survive the structured clone that Electron IPC performs. */
test("relays a stream through structured clone", async () => {
  const { client, disconnect } = connect(true, true);
  const sent = Array.from({ length: 40 }, (_, index) => ({
    data: new Uint8Array(8 * 1024).fill(index),
    compressed: false,
  }));
  const [writable, identifier] = client.pds.create();
  const writing = (async () => {
    const writer = writable.getWriter();
    for (const chunk of sent) {
      await writer.write(chunk);
    }
    await writer.close();
  })();
  const relayed = await client.callRpc("relay", identifier);
  expect(await readAll(client.pds.accept(relayed))).toEqual(sent);
  await writing;
  disconnect();
});

/** A frame is usually a view into a larger buffer, which structured clone would copy whole. */
test("keeps only a frame's own bytes for structured clone", () => {
  const data = Buffer.alloc(1024, 7).subarray(10, 20);
  const cloned = structuredClone(
    toCloneablePDSFrame({ type: "pdsFrame", pdsId: 1, data, compressed: false }),
  );
  expect(cloned.data?.buffer.byteLength).toBe(10);
  expect(cloned.data).toEqual(new Uint8Array(10).fill(7));
});

/** An unaccepted stream holds little memory and does not hold its writer forever. */
test("stops a stream that is not accepted, then cancels it after a minute", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  const { client, disconnect } = connect();
  const [writable] = client.pds.create();
  const writer = writable.getWriter();
  let written = 0;
  const writes = Array.from({ length: 20 }, () =>
    writer.write({ data: new Uint8Array(1), compressed: false }).then(() => {
      written += 1;
    }),
  );
  await jest.advanceTimersByTimeAsync(1000);
  expect(written).toBe(16);

  const cancelled = expect(Promise.all(writes)).rejects.toThrow("not accepted");
  await jest.advanceTimersByTimeAsync(60_000);
  await cancelled;
  disconnect();
});

/** Ending one side of a relayed stream reaches the other side through the server. */
test.each(["reader cancels", "writer aborts"] as const)(
  "ends the whole relay when the %s",
  async ending => {
    const { client, disconnect } = connect();
    const [writable, identifier] = client.pds.create();
    const writer = writable.getWriter();
    await writer.write({ data: new Uint8Array(1), compressed: false });
    const reader = client.pds.accept(await client.callRpc("relay", identifier)).getReader();
    await reader.read();

    if (ending === "reader cancels") {
      await reader.cancel(new Error("Not needed"));
      await expect(writer.closed).rejects.toThrow("Not needed");
    } else {
      await writer.abort(new Error("Gave up"));
      await expect(reader.read()).rejects.toThrow("Gave up");
    }
    disconnect();
  },
);

test("ends streams in both directions when the connection closes", async () => {
  const { client, disconnect } = connect();
  const [writable, identifier] = client.pds.create();
  const writer = writable.getWriter();
  const reader = client.pds.accept(await client.callRpc("relay", identifier)).getReader();

  disconnect();
  await expect(writer.closed).rejects.toThrow("closed the connection");
  await expect(reader.read()).rejects.toThrow("closed the connection");
});

test("throws without breaking the connection when streams are unsupported", async () => {
  const { client, disconnect } = connect(false);
  expect(() => client.pds.create()).toThrow("does not support");
  expect(() => client.pds.accept({ pdsId: 1 })).toThrow("does not support");
  await expect(client.callRpc("relay", { pdsId: 1 })).rejects.toThrow("does not support");
  expect(await client.callRpc("ping", undefined)).toBe("pong");
  disconnect();
});
