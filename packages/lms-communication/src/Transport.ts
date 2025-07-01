import { type LoggerInterface } from "@lmstudio/lms-common";
import { serializedLMSExtendedErrorSchema } from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { serializedOpaqueSchema } from "./serialization.js";

const clientToServerMessageSchema = z.discriminatedUnion("type", [
  // Communication
  z.object({
    type: z.literal("communicationWarning"),
    warning: z.string(),
  }),
  z.object({
    type: z.literal("keepAlive"),
  }),

  // Channel
  z.object({
    type: z.literal("channelCreate"),
    endpoint: z.string(),
    channelId: z.number().int(),
    creationParameter: serializedOpaqueSchema,
  }),
  z.object({
    type: z.literal("channelSend"),
    channelId: z.number().int(),
    message: serializedOpaqueSchema,
    ackId: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("channelAck"),
    channelId: z.number().int(),
    ackId: z.number().int(),
  }),

  // RPC
  z.object({
    type: z.literal("rpcCall"),
    endpoint: z.string(),
    callId: z.number().int(),
    parameter: serializedOpaqueSchema,
  }),

  // Readonly signal
  z.object({
    type: z.literal("signalSubscribe"),
    creationParameter: serializedOpaqueSchema,
    endpoint: z.string(),
    subscribeId: z.number().int(),
  }),
  z.object({
    type: z.literal("signalUnsubscribe"),
    subscribeId: z.number().int(),
  }),

  // Writable signal
  z.object({
    type: z.literal("writableSignalSubscribe"),
    creationParameter: serializedOpaqueSchema,
    endpoint: z.string(),
    subscribeId: z.number().int(),
  }),
  z.object({
    type: z.literal("writableSignalUnsubscribe"),
    subscribeId: z.number().int(),
  }),
  z.object({
    type: z.literal("writableSignalUpdate"),
    subscribeId: z.number().int(),
    patches: z.array(serializedOpaqueSchema),
    tags: z.array(z.string()),
  }),
]);

export type ClientToServerMessage = z.infer<typeof clientToServerMessageSchema>;

const serverToClientMessageSchema = z.discriminatedUnion("type", [
  // Communication
  z.object({
    type: z.literal("communicationWarning"),
    warning: z.string(),
  }),
  z.object({
    type: z.literal("keepAliveAck"),
  }),

  // Channel
  z.object({
    type: z.literal("channelSend"),
    channelId: z.number().int(),
    message: serializedOpaqueSchema,
    ackId: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("channelAck"),
    channelId: z.number().int(),
    ackId: z.number().int(),
  }),
  z.object({
    type: z.literal("channelClose"),
    channelId: z.number().int(),
  }),
  z.object({
    type: z.literal("channelError"),
    channelId: z.number().int(),
    error: serializedLMSExtendedErrorSchema,
  }),

  // RPC
  z.object({
    type: z.literal("rpcResult"),
    callId: z.number().int(),
    result: serializedOpaqueSchema,
  }),
  z.object({
    type: z.literal("rpcError"),
    callId: z.number().int(),
    error: serializedLMSExtendedErrorSchema,
  }),

  // Readonly signal
  z.object({
    type: z.literal("signalUpdate"),
    subscribeId: z.number().int(),
    patches: z.array(serializedOpaqueSchema),
    tags: z.array(z.string()),
  }),
  z.object({
    type: z.literal("signalError"),
    subscribeId: z.number().int(),
    error: serializedLMSExtendedErrorSchema,
  }),

  // Writable signal
  z.object({
    type: z.literal("writableSignalUpdate"),
    subscribeId: z.number().int(),
    patches: z.array(serializedOpaqueSchema),
    tags: z.array(z.string()),
  }),
  z.object({
    type: z.literal("writableSignalError"),
    subscribeId: z.number().int(),
    error: serializedLMSExtendedErrorSchema,
  }),
]);

export type ServerToClientMessage = z.infer<typeof serverToClientMessageSchema>;

export abstract class Transport<TIncoming, TOutgoing> {
  /**
   * Implemented by ClientTransport / ServerTransport. Called by transport implementation to verify
   * incoming message.
   */
  protected abstract parseIncomingMessage(message: any): TIncoming;
  /**
   * Implemented by transport. At this point, message is already validated.
   */
  protected abstract sendViaTransport(message: TOutgoing): void;
  /**
   * Implemented by ClientTransport / ServerTransport. Call by outside to send a message.
   */
  public abstract send(message: TOutgoing): void;
  /**
   * Whether this transport has been disposed.
   */
  protected disposed = false;
  public async [Symbol.asyncDispose]() {
    if (this.disposed) {
      throw new Error("Cannot dispose twice");
    }
    // Only sets disposed to true, transport implementations should override this method to
    // perform actual cleanup.
    this.disposed = true;
  }
}

export abstract class ClientTransport extends Transport<
  ServerToClientMessage,
  ClientToServerMessage
> {
  protected override parseIncomingMessage(message: any): ServerToClientMessage {
    return serverToClientMessageSchema.parse(message);
  }
  public override send(message: ClientToServerMessage) {
    const result = clientToServerMessageSchema.parse(message);
    this.sendViaTransport(result);
  }
  /**
   * Called by the client port when the number of open communications changes from 0 to 1. This
   * usually indicates the `socket.ref()` should be called to prevent the process from exiting.
   */
  public onHavingOneOrMoreOpenCommunication() {}
  // The following snippet is intentionally not a tsdoc (only 1 star as oppose to 2). There is
  // likely a bug in TypeScript that when we change it to tsdoc, on darwin and linux, it causes the
  // generated .d.ts file to be invalid. We have considered reporting this to TypeScript, but it is
  // way too difficult to narrow down, thus we just hope this is the only case that this error
  // occurs.
  /*
   * Called by the client port when the number of open communications changes from 1 or more to 0.
   * This usually indicates the `socket.unref()` should be called to allow the process to exit.
   */
  public onHavingNoOpenCommunication() {}
}

export type ClientTransportFactory = (
  receivedMessage: (message: ServerToClientMessage) => void,
  errored: (error: any) => void,
  parentLogger: LoggerInterface,
) => ClientTransport;

export abstract class ServerTransport extends Transport<
  ClientToServerMessage,
  ServerToClientMessage
> {
  protected override parseIncomingMessage(message: any): ClientToServerMessage {
    return clientToServerMessageSchema.parse(message);
  }
  public override send(message: ServerToClientMessage) {
    const result = serverToClientMessageSchema.parse(message);
    this.sendViaTransport(result);
  }
}
export type ServerTransportFactory = (
  receivedMessage: (message: ClientToServerMessage) => void,
  errored: (error: any) => void,
  parentLogger: LoggerInterface,
) => ServerTransport;
