import { BufferedEvent, Signal, SimpleLogger, makePromise } from "@lmstudio/lms-common";
import {
  type AnyBackendInterface,
  type ExtractBackendInterfaceChannelEndpoints,
} from "./BackendInterface";

export enum ConnectionStatus {
  /**
   * The underlying transport is connected and is communicating properly.
   */
  Connected = "CONNECTED",
  /**
   * The underlying transport has errored out.
   */
  Errored = "ERRORED",
  /**
   * The channel has been properly closed and no more messages will be sent or received.
   */
  Closed = "CLOSED",
}

const logger = new SimpleLogger("Channel");
export class Channel<TIncomingPacket, TOutgoingPacket> {
  /**
   * Trigger when a message is received.
   */
  public readonly onMessage: BufferedEvent<TIncomingPacket>;
  private readonly emitOnMessage: (packet: TIncomingPacket) => void;

  /**
   * Triggers when the underlying transport has errored out.
   */
  public readonly onError: BufferedEvent<any>;
  private readonly emitOnError: (error: any) => void;

  /**
   * Triggers when the channel has been properly closed and no more messages will be sent or
   * received.
   */
  public readonly onClose: BufferedEvent<void>;
  private readonly emitOnClose: () => void;

  public readonly connectionStatus: Signal<ConnectionStatus>;
  public readonly setConnectionStatus: (status: ConnectionStatus) => void;

  private nextAckId = 0;

  /**
   * A map for messages that are waiting for an ACK. The values are the functions to resolve or
   * reject the corresponding promise.
   */
  private readonly waitingForAck = new Map<
    number,
    { resolve: () => void; reject: (error: any) => void }
  >();

  private constructor(
    private readonly innerSend: (packet: TOutgoingPacket, ackId?: number) => void,
  ) {
    [this.onMessage, this.emitOnMessage] = BufferedEvent.create<TIncomingPacket>();
    [this.onError, this.emitOnError] = BufferedEvent.create<any>();
    [this.onClose, this.emitOnClose] = BufferedEvent.create<void>();
    [this.connectionStatus, this.setConnectionStatus] = Signal.create<ConnectionStatus>(
      ConnectionStatus.Connected,
    );
  }

  private rejectAllWaitingForAck(error: any) {
    const rejects = Array.from(this.waitingForAck.values()).map(({ reject }) => reject);
    this.waitingForAck.clear();
    for (const reject of rejects) {
      reject(error);
    }
  }
  /**
   * Returned as a part of create. It should be called by the controlling port.
   */
  private receivedACK = (ackId: number) => {
    if (this.connectionStatus.get() !== ConnectionStatus.Connected) {
      logger.warn("Received ACK while in status", this.connectionStatus.get());
      return;
    }
    const waiting = this.waitingForAck.get(ackId);
    if (waiting === undefined) {
      logger.warn("Received ACK for a message that is no longer waiting for ACK, ackId =", ackId);
      return;
    }
    waiting.resolve();
    this.waitingForAck.delete(ackId);
  };
  /**
   * Returned as a part of create. It should be called by the controlling port.
   */
  private receivedMessage = (packet: TIncomingPacket) => {
    if (this.connectionStatus.get() !== ConnectionStatus.Connected) {
      logger.warn("Received message while in status", this.connectionStatus.get());
      return;
    }
    this.emitOnMessage(packet);
  };
  /** Settles pending sends and reports the first failure supplied by the controlling port. */
  private errored = (error: unknown) => {
    if (this.connectionStatus.get() !== ConnectionStatus.Connected) {
      return;
    }
    this.rejectAllWaitingForAck(error);
    this.setConnectionStatus(ConnectionStatus.Errored);
    this.emitOnError(error);
  };
  /** Reports normal completion once; a late close must not overwrite an earlier error. */
  private closed = () => {
    if (this.connectionStatus.get() !== ConnectionStatus.Connected) {
      return;
    }
    this.rejectAllWaitingForAck(new Error("Channel closed"));
    this.setConnectionStatus(ConnectionStatus.Closed);
    this.emitOnClose();
  };
  public static create<TIncomingPacket, TOutgoingPacket>(
    innerSend: (packet: TOutgoingPacket, ackId?: number) => void,
  ) {
    const channel = new Channel<TIncomingPacket, TOutgoingPacket>(innerSend);
    return {
      channel,
      receivedAck: channel.receivedACK,
      receivedMessage: channel.receivedMessage,
      errored: channel.errored,
      closed: channel.closed,
    };
  }
  /** Sends a packet while the channel is open. */
  public send(packet: TOutgoingPacket) {
    if (this.connectionStatus.get() !== ConnectionStatus.Connected) {
      throw new Error("Cannot send on a terminated channel.");
    }
    this.innerSend(packet);
  }

  /** Waits for acknowledgement, rejecting if the channel ends or the send cannot start. */
  public sendAndWaitForACK(packet: TOutgoingPacket) {
    if (this.connectionStatus.get() !== ConnectionStatus.Connected) {
      return Promise.reject(new Error("Cannot send on a terminated channel."));
    }
    const { promise, resolve, reject } = makePromise<void>();
    const ackId = this.nextAckId;
    this.nextAckId++;
    this.waitingForAck.set(ackId, { resolve, reject });
    try {
      this.innerSend(packet, ackId);
    } catch (error) {
      this.waitingForAck.delete(ackId);
      reject(error);
    }
    return promise;
  }
}

export type InferServerChannelType<
  TBackendInterface extends AnyBackendInterface,
  TChannelName extends keyof ExtractBackendInterfaceChannelEndpoints<TBackendInterface>,
> = Channel<
  ExtractBackendInterfaceChannelEndpoints<TBackendInterface>[TChannelName]["toServerPacket"],
  ExtractBackendInterfaceChannelEndpoints<TBackendInterface>[TChannelName]["toClientPacket"]
>;

export type InferClientChannelType<
  TBackendInterface extends AnyBackendInterface,
  TChannelName extends keyof ExtractBackendInterfaceChannelEndpoints<TBackendInterface>,
> = Channel<
  ExtractBackendInterfaceChannelEndpoints<TBackendInterface>[TChannelName]["toClientPacket"],
  ExtractBackendInterfaceChannelEndpoints<TBackendInterface>[TChannelName]["toServerPacket"]
>;

export type InferChannelServerToClientPacketType<
  TBackendInterface extends AnyBackendInterface,
  TChannelName extends keyof ExtractBackendInterfaceChannelEndpoints<TBackendInterface>,
> = ExtractBackendInterfaceChannelEndpoints<TBackendInterface>[TChannelName]["toClientPacket"];

export type InferChannelClientToServerPacketType<
  TBackendInterface extends AnyBackendInterface,
  TChannelName extends keyof ExtractBackendInterfaceChannelEndpoints<TBackendInterface>,
> = ExtractBackendInterfaceChannelEndpoints<TBackendInterface>[TChannelName]["toServerPacket"];
