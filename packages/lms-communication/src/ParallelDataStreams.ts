import { makePromise } from "@lmstudio/lms-common";
import { fromSerializedError, serializeError } from "@lmstudio/lms-shared-types";
import { type ClientToServerMessage, type Transport } from "./Transport.js";

/** One write to a parallel data stream. */
export interface PDSChunk {
  data: Uint8Array;
  /** Set when the data is already compressed (a PNG, for example), so it isn't compressed again. */
  compressed: boolean;
}

/**
 * Names a parallel data stream inside RPC, channel or signal payloads. It only works on the
 * connection that created it. To pass a stream on, accept it and pipe it into a new one.
 */
export interface PDSIdentifier {
  readonly pdsId: number;
}

/**
 * What transports carry for parallel data streams. It is plain data, so it survives structured
 * clone (Electron IPC). Transports that keep frames and messages in one queue tell them apart by
 * `type`.
 */
export interface PDSFrame {
  type: "pdsFrame";
  pdsId: number;
  /** Null marks the end of the stream. */
  data: Uint8Array | null;
  compressed: boolean;
}

/**
 * Tells a frame apart from a message in a shared queue. The peer controls what arrives, so the
 * whole shape is checked before the frame reaches the streams.
 */
export function isPDSFrame(value: unknown): value is PDSFrame {
  const frame = value as Partial<PDSFrame> | null;
  return (
    typeof frame === "object" &&
    frame !== null &&
    frame.type === "pdsFrame" &&
    Number.isInteger(frame.pdsId) &&
    (frame.data === null || frame.data instanceof Uint8Array) &&
    typeof frame.compressed === "boolean"
  );
}

/**
 * Prepares a frame for structured clone, which Electron IPC and `postMessage` use. Structured clone
 * copies the whole buffer behind a view, and a frame is usually a small view into a larger buffer,
 * so only the frame's own bytes are kept.
 */
export function toCloneablePDSFrame(frame: PDSFrame): PDSFrame {
  // `Buffer#slice` would return another view, so copy through the Uint8Array constructor.
  return { ...frame, data: frame.data === null ? null : new Uint8Array(frame.data) };
}

export type PDSMessage = Extract<
  ClientToServerMessage,
  { type: "pdsOpen" | "pdsCredit" | "pdsCancel" }
>;

// Allowances count frames, and a frame carries at most this many bytes.
const maximumFrameBytes = 64 * 1024;
// How many frames a writer may send before its stream is accepted, and how far ahead of the reader
// it may get afterwards. Only the reader uses `acceptedAllowance`, so it can grow without breaking
// older writers.
const unacceptedAllowance = 16;
const acceptedAllowance = 1024;
// Bounds the frames in flight on one connection, so the queues between processes can't overflow.
// The LM Link connector queues at most this many stream frames per connection.
const connectionAllowance = 1024;
const maximumUnacceptedStreams = 1024;
const expiryMs = 60_000;

interface OutgoingPDS {
  controller: WritableStreamDefaultController;
  allowance: number;
  /** Why the stream ended early. A write in progress rejects with it. */
  error?: unknown;
}

interface IncomingPDS {
  readable: ReadableStream<PDSChunk>;
  controller: ReadableStreamDefaultController<PDSChunk>;
  opened: boolean;
  accepted: boolean;
  ended: boolean;
  /** Frames received so far, including the end frame. */
  received: number;
  /** Frames the writer may send in total. */
  allowed: number;
  expiry: ReturnType<typeof setTimeout>;
}

/**
 * Byte streams that run next to a port's messages, for files and media that are wasteful to send
 * as JSON. Each port has one: `clientPort.pds`, or `ctx.pds` in handlers.
 *
 * The reader gives the writer an allowance of frames and tops it up as data is read, so a reader
 * that stops reading also stops the writer. Streams have lower priority than messages.
 */
export class ParallelDataStreams {
  private readonly outgoing = new Map<number, OutgoingPDS>();
  private readonly incoming = new Map<number, IncomingPDS>();
  private connectionAllowance = connectionAllowance;
  /** Frames received on this connection that the writer hasn't been credited for yet. */
  private uncreditedFrames = 0;
  private changed = makePromise<void>();

  /**
   * `idSign` is 1 on the client and -1 on the server. The two sides then never pick the same ID,
   * so an ID alone says whose stream it is.
   */
  public constructor(
    private readonly idSign: 1 | -1,
    private readonly getTransport: () => Pick<
      Transport<unknown, unknown>,
      "pdsSupported" | "sendPDSFrame"
    >,
    private readonly sendMessage: (message: PDSMessage) => void,
  ) {}

  /**
   * Starts a stream to the peer and returns its writable and identifier. Writing can start right
   * away, before the peer accepts. Send the identifier through any endpoint so the peer can accept
   * the stream. Written buffers are handed over and must not be reused.
   *
   * Throws when the connection can't carry parallel data streams. While that isn't known yet, the
   * stream waits, and it errors if the connection turns out not to support them.
   */
  public create(): [WritableStream<PDSChunk>, PDSIdentifier] {
    if (this.getTransport().pdsSupported === false) {
      throw new Error("This connection does not support parallel data streams.");
    }
    let pdsId: number;
    do {
      // Random, so an identifier kept from an earlier connection doesn't match a new stream. Fits
      // in a signed 32-bit integer.
      pdsId = this.idSign * (1 + Math.floor(Math.random() * (2 ** 31 - 1)));
    } while (this.outgoing.has(pdsId));
    let pds!: OutgoingPDS;
    const writable = new WritableStream<PDSChunk>({
      start: async controller => {
        pds = { controller, allowance: unacceptedAllowance };
        this.outgoing.set(pdsId, pds);
        // Abort shows up here right away. The sink's own abort would wait for a write that may be
        // stuck waiting for allowance.
        controller.signal.addEventListener("abort", () => {
          if (this.outgoing.get(pdsId) !== pds) {
            return;
          }
          this.outgoing.delete(pdsId);
          pds.error = controller.signal.reason;
          if (this.getTransport().pdsSupported === true) {
            const error = serializeError(controller.signal.reason);
            this.sendMessage({ type: "pdsCancel", pdsId, error });
          }
          this.wake();
        });
        await this.send(pdsId, pds, null);
      },
      write: async ({ data, compressed }) => {
        for (let offset = 0; offset < data.byteLength; offset += maximumFrameBytes) {
          const frameData = data.subarray(offset, offset + maximumFrameBytes);
          await this.send(pdsId, pds, { type: "pdsFrame", pdsId, data: frameData, compressed });
        }
      },
      close: async () => {
        await this.send(pdsId, pds, { type: "pdsFrame", pdsId, data: null, compressed: false });
        this.outgoing.delete(pdsId);
      },
    });
    return [writable, { pdsId }];
  }

  /**
   * Reads a stream the peer created. Accept right away: the peer can send only a little before
   * that, and a stream that isn't accepted within a minute is cancelled. Accepting an identifier
   * whose stream never opens fails after the same minute.
   */
  public accept({ pdsId }: PDSIdentifier): ReadableStream<PDSChunk> {
    if (this.getTransport().pdsSupported === false) {
      throw new Error("This connection does not support parallel data streams.");
    }
    if (Math.sign(pdsId) === this.idSign) {
      throw new Error(`Parallel data stream ${pdsId} was created on this side, not by the peer.`);
    }
    const pds = this.incoming.get(pdsId) ?? this.addIncoming(pdsId);
    if (pds.accepted) {
      throw new Error(`Parallel data stream ${pdsId} was already accepted.`);
    }
    pds.accepted = true;
    if (pds.opened) {
      clearTimeout(pds.expiry);
    }
    if (pds.ended) {
      this.incoming.delete(pdsId);
    } else {
      this.topUp(pdsId, pds);
    }
    return pds.readable;
  }

  /** Handles the PDS messages from the peer. */
  public receivedMessage(message: PDSMessage) {
    switch (message.type) {
      case "pdsOpen": {
        // A peer may only open streams in its own half of the ID space.
        if (Math.sign(message.pdsId) === this.idSign) {
          break;
        }
        const unaccepted = [...this.incoming.values()].filter(pds => !pds.accepted).length;
        if (unaccepted >= maximumUnacceptedStreams) {
          const error = new Error("Too many parallel data streams are waiting to be accepted.");
          this.sendMessage({
            type: "pdsCancel",
            pdsId: message.pdsId,
            error: serializeError(error),
          });
          break;
        }
        const pds = this.incoming.get(message.pdsId) ?? this.addIncoming(message.pdsId);
        pds.opened = true;
        if (pds.accepted) {
          clearTimeout(pds.expiry);
        }
        break;
      }
      case "pdsCredit": {
        if (message.pdsId === undefined) {
          this.connectionAllowance += message.frames;
        } else {
          const pds = this.outgoing.get(message.pdsId);
          if (pds === undefined) {
            break;
          }
          pds.allowance += message.frames;
        }
        this.wake();
        break;
      }
      case "pdsCancel": {
        // The sides never share IDs, so the stream is either one we write or one we read.
        const error = fromSerializedError(message.error, "Parallel data stream cancelled");
        const outgoing = this.outgoing.get(message.pdsId);
        if (outgoing !== undefined) {
          this.outgoing.delete(message.pdsId);
          outgoing.error = error;
          outgoing.controller.error(error);
          this.wake();
        }
        const incoming = this.incoming.get(message.pdsId);
        if (incoming !== undefined) {
          clearTimeout(incoming.expiry);
          this.incoming.delete(message.pdsId);
          incoming.controller.error(error);
        }
        break;
      }
    }
  }

  /**
   * Handles a frame from the peer. Transports deliver a stream's frames after its `pdsOpen`, so
   * an unknown stream here is one that was already dropped.
   */
  public receivedFrame({ pdsId, data, compressed }: PDSFrame) {
    // Dropped streams still used connection allowance, so their frames are credited too.
    this.uncreditedFrames += 1;
    if (this.uncreditedFrames >= connectionAllowance / 2) {
      this.sendMessage({ type: "pdsCredit", frames: this.uncreditedFrames });
      this.uncreditedFrames = 0;
    }
    const pds = this.incoming.get(pdsId);
    if (pds === undefined) {
      return;
    }
    pds.received += 1;
    if (pds.received > pds.allowed) {
      this.dropIncoming(pdsId, pds, new Error("The peer sent more than its stream allowance."));
      return;
    }
    if (data !== null) {
      pds.controller.enqueue({ data, compressed });
      return;
    }
    pds.ended = true;
    pds.controller.close();
    // An unaccepted stream stays until it is accepted or expires, so its identifier still works.
    if (pds.accepted) {
      this.incoming.delete(pdsId);
    }
  }

  /** Ends every stream when the connection goes away. The next connection starts fresh. */
  public fail(error: unknown) {
    for (const pds of this.outgoing.values()) {
      pds.error = error;
      pds.controller.error(error);
    }
    for (const pds of this.incoming.values()) {
      clearTimeout(pds.expiry);
      pds.controller.error(error);
    }
    this.outgoing.clear();
    this.incoming.clear();
    this.connectionAllowance = connectionAllowance;
    this.uncreditedFrames = 0;
    this.wake();
  }

  /** Lets waiting writers recheck. Call it whenever something they wait on may have changed. */
  public wake() {
    this.changed.resolve();
    this.changed = makePromise();
  }

  /**
   * Waits until the peer can take `frame` and sends it. Without a frame, sends the `pdsOpen`, which
   * only needs the peer to support PDS.
   */
  private async send(pdsId: number, pds: OutgoingPDS, frame: PDSFrame | null) {
    // Credits, support changes, cancellation and disconnects all wake this loop, so each pass
    // rechecks everything. Sending happens right after the check, before anything can change.
    while (this.outgoing.get(pdsId) === pds) {
      const transport = this.getTransport();
      if (transport.pdsSupported === false) {
        this.outgoing.delete(pdsId);
        throw new Error("This connection does not support parallel data streams.");
      }
      if (transport.pdsSupported === true && frame === null) {
        this.sendMessage({ type: "pdsOpen", pdsId });
        return;
      }
      if (transport.pdsSupported === true && pds.allowance > 0 && this.connectionAllowance > 0) {
        pds.allowance -= 1;
        this.connectionAllowance -= 1;
        transport.sendPDSFrame!(frame!);
        return;
      }
      await this.changed.promise;
    }
    // The stream was cancelled, aborted or lost with its connection.
    throw pds.error;
  }

  /**
   * Tracks an incoming stream from whichever comes first: the peer opening it or the app
   * accepting it.
   */
  private addIncoming(pdsId: number): IncomingPDS {
    let controller!: ReadableStreamDefaultController<PDSChunk>;
    const readable = new ReadableStream<PDSChunk>(
      {
        start: startController => {
          controller = startController;
        },
        // Runs after the reader takes chunks, which is when the writer can be given more.
        pull: () => this.topUp(pdsId, pds),
        cancel: reason => this.dropIncoming(pdsId, pds, reason),
      },
      // The high water mark only gives `desiredSize` a fixed point to count queued frames from.
      { highWaterMark: acceptedAllowance },
    );
    const pds: IncomingPDS = {
      readable,
      controller,
      opened: false,
      accepted: false,
      ended: false,
      received: 0,
      allowed: unacceptedAllowance,
      expiry: setTimeout(() => {
        const missing = pds.opened ? "accepted" : "opened";
        this.dropIncoming(
          pdsId,
          pds,
          new Error(`Parallel data stream was not ${missing} in time.`),
        );
      }, expiryMs),
    };
    this.incoming.set(pdsId, pds);
    return pds;
  }

  /** Gives the writer more allowance once the reader has made room. */
  private topUp(pdsId: number, pds: IncomingPDS) {
    if (!pds.accepted || this.incoming.get(pdsId) !== pds) {
      return;
    }
    // Received frames the reader hasn't taken are still queued. The end frame is never queued,
    // so it counts as read.
    const read = pds.received - (acceptedAllowance - pds.controller.desiredSize!);
    const frames = read + acceptedAllowance - pds.allowed;
    // Credits wait until the writer is down to half its allowance. That keeps them rare without
    // letting the writer run dry while the reader keeps up.
    if (frames < acceptedAllowance / 2) {
      return;
    }
    pds.allowed += frames;
    this.sendMessage({ type: "pdsCredit", pdsId, frames });
  }

  /** Forgets an incoming stream and fails its reader. Tells the writer to stop if it still sends. */
  private dropIncoming(pdsId: number, pds: IncomingPDS, error: unknown) {
    if (this.incoming.get(pdsId) !== pds) {
      return;
    }
    clearTimeout(pds.expiry);
    this.incoming.delete(pdsId);
    pds.controller.error(error);
    if (pds.opened && !pds.ended) {
      this.sendMessage({ type: "pdsCancel", pdsId, error: serializeError(error) });
    }
  }
}
