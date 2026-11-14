import { BufferedEvent, SimpleLogger } from "@lmstudio/lms-common";
import {
  BackendInterface,
  ParallelDataStreams,
  toCloneablePDSFrame,
  type PDSChunk,
  type PDSFrame,
  type PDSMessage,
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

/** One side's streams on their own, so a test can play the peer message by message. */
function createSide(idSign: 1 | -1) {
  const frames: Array<PDSFrame> = [];
  const messages: Array<PDSMessage> = [];
  const pds = new ParallelDataStreams(
    idSign,
    () => ({ pdsSupported: true, sendPDSFrame: frame => frames.push(frame) }),
    message => messages.push(message),
  );
  return { pds, frames, messages };
}

/** Lets writers waiting for allowance send what they can. */
async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0));
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

/** Frames can be any size, so the allowance counts bytes. */
test("drops a stream whose frames go past its allowance", () => {
  const reader = createSide(-1);
  reader.pds.receivedMessage({ type: "pdsOpen", pdsId: 5 });
  expect(reader.messages[0]).toEqual({
    type: "pdsWindow",
    connectionBytes: 64 * 1024 * 1024,
    unacceptedStreamBytes: 1024 * 1024,
    minimumFrameBytes: 64 * 1024,
  });

  reader.pds.receivedFrame({
    type: "pdsFrame",
    pdsId: 5,
    data: new Uint8Array(2 * 1024 * 1024),
    compressed: false,
  });
  expect(reader.messages[1]).toMatchObject({
    type: "pdsCancel",
    pdsId: 5,
    error: { title: "The peer sent more than its stream allowance." },
  });
});

test("sends only what the peer's window and credits allow", async () => {
  const writer = createSide(1);
  const [writable] = writer.pds.create();
  void writable.getWriter().write({ data: new Uint8Array(3 * 1024 * 1024), compressed: false });
  await settle();
  expect(writer.messages).toEqual([{ type: "pdsOpen", pdsId: expect.any(Number) }]);
  expect(writer.frames).toHaveLength(0);

  writer.pds.receivedMessage({
    type: "pdsWindow",
    connectionBytes: 64 * 1024 * 1024,
    unacceptedStreamBytes: 1024 * 1024,
    minimumFrameBytes: 64 * 1024,
  });
  await settle();
  const sentBytes = () => writer.frames.reduce((total, frame) => total + frame.data!.byteLength, 0);
  expect(sentBytes()).toBe(1024 * 1024);

  const pdsId = writer.frames[0]!.pdsId;
  writer.pds.receivedMessage({ type: "pdsCredit", pdsId, bytes: 512 * 1024 });
  await settle();
  expect(sentBytes()).toBe(1536 * 1024);
});

/** Transports queue a limited number of frames, however small the peer lets them be. */
test("keeps at most 1024 frames in flight until the connection is credited", async () => {
  const writer = createSide(1);
  writer.pds.receivedMessage({
    type: "pdsWindow",
    connectionBytes: 1024 * 1024 * 1024,
    unacceptedStreamBytes: 1024 * 1024 * 1024,
    minimumFrameBytes: 1,
  });
  const [writable] = writer.pds.create();
  const streamWriter = writable.getWriter();
  for (let index = 0; index < 2000; index++) {
    void streamWriter.write({ data: new Uint8Array(1), compressed: false });
  }
  await settle();
  expect(writer.frames).toHaveLength(1024);

  // The reader credits what the oldest 512 frames cost.
  writer.pds.receivedMessage({ type: "pdsCredit", bytes: 512 });
  await settle();
  expect(writer.frames).toHaveLength(1536);
});

test("throws without breaking the connection when streams are unsupported", async () => {
  const { client, disconnect } = connect(false);
  expect(() => client.pds.create()).toThrow("does not support");
  expect(() => client.pds.accept({ pdsId: 1 })).toThrow("does not support");
  await expect(client.callRpc("relay", { pdsId: 1 })).rejects.toThrow("does not support");
  expect(await client.callRpc("ping", undefined)).toBe("pong");
  disconnect();
});
