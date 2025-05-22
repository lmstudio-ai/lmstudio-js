import { type EventEmitter } from "events";

// Vendored types from electron

export interface MessagePortMain extends EventEmitter {
  // Docs: https://electronjs.org/docs/api/message-port-main

  /**
   * Emitted when the remote end of a MessagePortMain object becomes disconnected.
   */
  on(event: "close", listener: Function): this;
  once(event: "close", listener: Function): this;
  addListener(event: "close", listener: Function): this;
  removeListener(event: "close", listener: Function): this;
  /**
   * Emitted when a MessagePortMain object receives a message.
   */
  on(event: "message", listener: (messageEvent: MessageEvent) => void): this;
  once(event: "message", listener: (messageEvent: MessageEvent) => void): this;
  addListener(event: "message", listener: (messageEvent: MessageEvent) => void): this;
  removeListener(event: "message", listener: (messageEvent: MessageEvent) => void): this;
  /**
   * Disconnects the port, so it is no longer active.
   */
  close(): void;
  /**
   * Sends a message from the port, and optionally, transfers ownership of objects to
   * other browsing contexts.
   */
  postMessage(message: any, transfer?: MessagePortMain[]): void;
  /**
   * Starts the sending of messages queued on the port. Messages will be queued until
   * this method is called.
   */
  start(): void;
}

export interface IpcMainEvent extends Event {
  // Docs: https://electronjs.org/docs/api/structures/ipc-main-event

  /**
   * The ID of the renderer frame that sent this message
   */
  frameId: number;
  /**
   * A list of MessagePorts that were transferred with this message
   */
  ports: MessagePortMain[];
  /**
   * The internal ID of the renderer process that sent this message
   */
  processId: number;
  /**
   * A function that will send an IPC message to the renderer frame that sent the
   * original message that you are currently handling.  You should use this method to
   * "reply" to the sent message in order to guarantee the reply will go to the
   * correct process and frame.
   */
  reply: Function;
  /**
   * Set this to the value to be returned in a synchronous message
   */
  returnValue: any;
  /**
   * Returns the `webContents` that sent the message
   */
  sender: any;
  /**
   * The frame that sent this message
   */
  readonly senderFrame: any;
}
