/* eslint-disable @typescript-eslint/ban-types */
import { type NotAvailable, type Setter, type SignalLike } from "@lmstudio/lms-common";
import { type InferPayloadSchema, type PayloadSchema } from "./PayloadCodec.js";
import type { Channel } from "./Channel.js";
import { type SerializationType } from "./serialization.js";

export type RpcEndpointHandler<TContext = any, TParameter = any, TReturns = any> = (
  ctx: TContext,
  parameter: TParameter,
) => TReturns | Promise<TReturns>;

export type ChannelEndpointHandler<
  TContext = any,
  TCreationParameter = any,
  TToServerPacket = any,
  TToClientPacket = any,
> = (
  ctx: TContext,
  creationParameter: TCreationParameter,
  channel: Channel<TToServerPacket, TToClientPacket>,
) => Promise<void>;

export type SignalEndpointHandler<TContext = any, TCreationParameter = any, TData = any> = (
  ctx: TContext,
  creationParameter: TCreationParameter,
) =>
  | SignalLike<TData>
  | Promise<SignalLike<TData>>
  | SignalLike<TData | NotAvailable>
  | Promise<SignalLike<TData | NotAvailable>>;

export type WritableSignalEndpointHandler<TContext = any, TCreationParameter = any, TData = any> = (
  ctx: TContext,
  creationParameter: TCreationParameter,
) =>
  | readonly [signal: SignalLike<TData>, setter: Setter<TData>]
  | Promise<readonly [signal: SignalLike<TData>, setter: Setter<TData>]>
  | readonly [signal: SignalLike<TData | NotAvailable>, setter: Setter<TData>]
  | Promise<readonly [signal: SignalLike<TData | NotAvailable>, setter: Setter<TData>]>;

export interface RpcEndpoint<TParameter = unknown, TReturns = unknown> {
  name: string;
  parameter: PayloadSchema<TParameter>;
  returns: PayloadSchema<TReturns>;
  serialization: SerializationType;
  handler: RpcEndpointHandler | null;
}

export interface ChannelEndpoint<
  TCreationParameter = unknown,
  TToServerPacket = unknown,
  TToClientPacket = unknown,
> {
  name: string;
  creationParameter: PayloadSchema<TCreationParameter>;
  toServerPacket: PayloadSchema<TToServerPacket>;
  toClientPacket: PayloadSchema<TToClientPacket>;
  serialization: SerializationType;
  handler: ChannelEndpointHandler | null;
}

export interface SignalEndpoint<TCreationParameter = unknown, TSignalData = unknown> {
  name: string;
  creationParameter: PayloadSchema<TCreationParameter>;
  signalData: PayloadSchema<TSignalData>;
  serialization: SerializationType;
  skipSignalDataValidation: boolean;
  handler: SignalEndpointHandler | null;
}

export interface WritableSignalEndpoint<TCreationParameter = unknown, TSignalData = unknown> {
  name: string;
  creationParameter: PayloadSchema<TCreationParameter>;
  signalData: PayloadSchema<TSignalData>;
  serialization: SerializationType;
  skipSignalDataValidation: boolean;
  handler: WritableSignalEndpointHandler | null;
}

interface RpcEndpointSpecBase {
  parameter: any;
  returns: any;
}

export type RpcEndpointsSpecBase = {
  [endpointName: string]: RpcEndpointSpecBase;
};

interface ChannelEndpointSpecBase {
  creationParameter: any;
  toServerPacket: any;
  toClientPacket: any;
}

export type ChannelEndpointsSpecBase = {
  [endpointName: string]: ChannelEndpointSpecBase;
};

interface SignalEndpointSpecBase {
  creationParameter: any;
  signalData: any;
}

export type SignalEndpointsSpecBase = {
  [endpointName: string]: SignalEndpointSpecBase;
};

interface WritableSignalEndpointSpecBase {
  creationParameter: any;
  signalData: any;
}

export type WritableSignalEndpointsSpecBase = {
  [endpointName: string]: WritableSignalEndpointSpecBase;
};

export class BackendInterface<
  TContext = never,
  TRpcEndpoints extends RpcEndpointsSpecBase = {},
  TChannelEndpoints extends ChannelEndpointsSpecBase = {},
  TSignalEndpoints extends SignalEndpointsSpecBase = {},
  TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase = {},
> {
  private unhandledEndpoints = new Set<string>();
  private existingEndpointNames = new Set<string>();
  private rpcEndpoints = new Map<string, RpcEndpoint>();
  private channelEndpoints = new Map<string, ChannelEndpoint>();
  private signalEndpoints = new Map<string, SignalEndpoint>();
  private writableSignalEndpoints = new Map<string, WritableSignalEndpoint>();

  public constructor() {}

  public withContextType<TContextType>() {
    return this as any as BackendInterface<
      TContextType,
      TRpcEndpoints,
      TChannelEndpoints,
      TSignalEndpoints,
      TWritableSignalEndpoints
    >;
  }

  private assertEndpointNameNotExists(endpointName: string) {
    if (this.existingEndpointNames.has(endpointName)) {
      throw new Error(`Endpoint with name ${endpointName} already exists`);
    }
  }

  /**
   * Register an Rpc endpoint.
   */
  public addRpcEndpoint<
    TEndpointName extends string,
    TParameterSchema extends PayloadSchema,
    TReturnsSchema extends PayloadSchema,
  >(
    endpointName: TEndpointName,
    {
      parameter,
      returns,
      serialization = "raw",
    }: {
      parameter: TParameterSchema;
      returns: TReturnsSchema;
      serialization?: SerializationType;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints & {
      [endpointName in TEndpointName]: {
        parameter: InferPayloadSchema<TParameterSchema>;
        returns: InferPayloadSchema<TReturnsSchema>;
      };
    },
    TChannelEndpoints,
    TSignalEndpoints,
    TWritableSignalEndpoints
  > {
    this.assertEndpointNameNotExists(endpointName);
    this.existingEndpointNames.add(endpointName);
    this.rpcEndpoints.set(endpointName, {
      name: endpointName,
      parameter,
      returns,
      serialization,
      handler: null,
    });
    return this;
  }

  /** Registers both packet directions independently from the creation parameters. */
  public addChannelEndpoint<
    TEndpointName extends string,
    TCreationParameterSchema extends PayloadSchema,
    TToServerPacketSchema extends PayloadSchema,
    TToClientPacketSchema extends PayloadSchema,
  >(
    endpointName: TEndpointName,
    {
      creationParameter,
      toServerPacket,
      toClientPacket,
      serialization = "raw",
    }: {
      creationParameter: TCreationParameterSchema;
      toServerPacket: TToServerPacketSchema;
      toClientPacket: TToClientPacketSchema;
      serialization?: SerializationType;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints & {
      [endpointName in TEndpointName]: {
        creationParameter: InferPayloadSchema<TCreationParameterSchema>;
        toServerPacket: InferPayloadSchema<TToServerPacketSchema>;
        toClientPacket: InferPayloadSchema<TToClientPacketSchema>;
      };
    },
    TSignalEndpoints,
    TWritableSignalEndpoints
  > {
    this.assertEndpointNameNotExists(endpointName);
    this.existingEndpointNames.add(endpointName);
    this.channelEndpoints.set(endpointName, {
      name: endpointName,
      creationParameter,
      toServerPacket,
      toClientPacket,
      serialization,
      handler: null,
    });
    return this;
  }

  /** Registers a readonly signal with its exposed payload type. */
  public addSignalEndpoint<
    TEndpointName extends string,
    TCreationParameterSchema extends PayloadSchema,
    TSignalDataSchema extends PayloadSchema,
  >(
    endpointName: TEndpointName,
    {
      creationParameter,
      signalData,
      serialization = "raw",
      skipSignalDataValidation = false,
    }: {
      creationParameter: TCreationParameterSchema;
      signalData: TSignalDataSchema;
      serialization?: SerializationType;
      skipSignalDataValidation?: boolean;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints & {
      [endpointName in TEndpointName]: {
        creationParameter: InferPayloadSchema<TCreationParameterSchema>;
        signalData: InferPayloadSchema<TSignalDataSchema>;
      };
    },
    TWritableSignalEndpoints
  > {
    this.assertEndpointNameNotExists(endpointName);
    this.existingEndpointNames.add(endpointName);
    this.signalEndpoints.set(endpointName, {
      name: endpointName,
      creationParameter,
      signalData,
      serialization,
      skipSignalDataValidation,
      handler: null,
    });
    return this;
  }

  /** Registers a writable signal using one payload type for reads and writes. */
  public addWritableSignalEndpoint<
    TEndpointName extends string,
    TCreationParameterSchema extends PayloadSchema,
    TSignalDataSchema extends PayloadSchema,
  >(
    endpointName: TEndpointName,
    {
      creationParameter,
      signalData,
      serialization = "raw",
      skipSignalDataValidation = false,
    }: {
      creationParameter: TCreationParameterSchema;
      signalData: TSignalDataSchema;
      serialization?: SerializationType;
      skipSignalDataValidation?: boolean;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints,
    TWritableSignalEndpoints & {
      [endpointName in TEndpointName]: {
        creationParameter: InferPayloadSchema<TCreationParameterSchema>;
        signalData: InferPayloadSchema<TSignalDataSchema>;
      };
    }
  > {
    this.assertEndpointNameNotExists(endpointName);
    this.existingEndpointNames.add(endpointName);
    this.writableSignalEndpoints.set(endpointName, {
      name: endpointName,
      creationParameter,
      signalData,
      serialization,
      skipSignalDataValidation,
      handler: null,
    });
    return this;
  }

  /**
   * Adds a handler for an Rpc endpoint.
   *
   * @param endpointName - The name of the endpoint.
   * @param handler - The handler function. Will be called when the endpoint is invoked. When
   * called, the first parameter is the context, and the second parameter is the "parameter" for the
   * RPC call. Can return a value or a promise that resolves to the result.
   */
  public handleRpcEndpoint<TEndpointName extends keyof TRpcEndpoints & string>(
    endpointName: TEndpointName,
    handler: RpcEndpointHandler<
      TContext,
      TRpcEndpoints[TEndpointName]["parameter"],
      TRpcEndpoints[TEndpointName]["returns"]
    >,
  ) {
    const endpoint = this.rpcEndpoints.get(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No Rpc endpoint with name ${endpointName}`);
    }
    if (endpoint.handler !== null) {
      throw new Error(`Rpc endpoint with name ${endpointName} already has a handler`);
    }
    endpoint.handler = handler;
    this.unhandledEndpoints.delete(endpointName);
  }

  /**
   * Adds a handler for a channel endpoint.
   *
   * @param endpointName - The name of the endpoint.
   * @param handler - The handler function. Will be called when the client creates a channel for
   * this endpoint. When called, the first parameter is the context, the second parameter is the
   * "creationParameter" for the channel, and the third parameter is a channel object that can be
   * used to send and receive messages from the client.
   *
   * Must return a promise. Once that promise is settled, the channel will be closed.
   */
  public handleChannelEndpoint<TEndpointName extends keyof TChannelEndpoints & string>(
    endpointName: TEndpointName,
    handler: ChannelEndpointHandler<
      TContext,
      TChannelEndpoints[TEndpointName]["creationParameter"],
      TChannelEndpoints[TEndpointName]["toServerPacket"],
      TChannelEndpoints[TEndpointName]["toClientPacket"]
    >,
  ) {
    const endpoint = this.channelEndpoints.get(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No channel endpoint with name ${endpointName}`);
    }
    if (endpoint.handler !== null) {
      throw new Error(`Channel endpoint with name ${endpointName} already has a handler`);
    }
    endpoint.handler = handler;
    this.unhandledEndpoints.delete(endpointName);
  }

  /**
   * Adds a handler for a signal endpoint.
   *
   * @param endpointName - The name of the endpoint.
   * @param handler - The handler function. Will be called when the client creates a signal, and at
   * least one subscriber is attached to that signal. When called, the first parameter is the
   * context, and the second parameter is the "creationParameter" for the signal. This method should
   * return a SignalLike, or a promise that resolves to a SignalLike.
   *
   * Note: There is no 1-to-1 correlation between the signal on the client side and the number of
   * times this handler is called. Every time the number of client subscribers changes from 0 to 1,
   * this handler will be called. Every time the number of client subscribers changes from 1 to 0,
   * the signal returned from this handler will be unsubscribed.
   *
   * Caution: Do NOT create new subscriptions that don't self-terminate in this handler, as it will
   * cause memory leaks. That is, either:
   *
   * - Return a signal that already exists
   * - Create and return a LazySignal
   */
  public handleSignalEndpoint<TEndpointName extends keyof TSignalEndpoints & string>(
    endpointName: TEndpointName,
    handler: SignalEndpointHandler<
      TContext,
      TSignalEndpoints[TEndpointName]["creationParameter"],
      TSignalEndpoints[TEndpointName]["signalData"]
    >,
  ) {
    const endpoint = this.signalEndpoints.get(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No signal endpoint with name ${endpointName}`);
    }
    if (endpoint.handler !== null) {
      throw new Error(`Signal endpoint with name ${endpointName} already has a handler`);
    }
    endpoint.handler = handler;
    this.unhandledEndpoints.delete(endpointName);
  }

  /**
   * Adds a handler for a writable signal endpoint.
   *
   * @param endpointName - The name of the endpoint.
   * @param handler - The handler function. Will be called when the client creates a writable
   * signal, and at least one subscriber is attached to that signal. When called, the first
   * parameter is the context, and the second parameter is the "creationParameter" for the signal.
   * This method should return a tuple of the signal and an update function. The update function
   * should be called with the new data, patches, and tags to update the signal.
   *
   * Note: There is no 1-to-1 correlation between the signal on the client side and the number of
   * times this handler is called. Every time the number of client subscribers changes from 0 to 1,
   * this handler will be called. Every time the number of client subscribers changes from 1 to 0
   * the signal returned from this handler will be unsubscribed.
   *
   * Caution: Do NOT create new subscriptions that don't self-terminate in this handler, as it will
   * cause memory leaks. That is, either:
   *
   * - Return a signal that already exists
   * - Create and return a LazySignal
   */
  public handleWritableSignalEndpoint<
    TEndpointName extends keyof TWritableSignalEndpoints & string,
  >(
    endpointName: TEndpointName,
    handler: WritableSignalEndpointHandler<
      TContext,
      TWritableSignalEndpoints[TEndpointName]["creationParameter"],
      TWritableSignalEndpoints[TEndpointName]["signalData"]
    >,
  ) {
    const endpoint = this.writableSignalEndpoints.get(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No writable signal endpoint with name ${endpointName}`);
    }
    if (endpoint.handler !== null) {
      throw new Error(`Writable signal endpoint with name ${endpointName} already has a handler`);
    }
    endpoint.handler = handler;
    this.unhandledEndpoints.delete(endpointName);
  }

  public assertAllEndpointsHandled() {
    if (this.unhandledEndpoints.size > 0) {
      throw new Error(
        `The following endpoints were not handled: ${Array.from(this.unhandledEndpoints).join(
          ", ",
        )}`,
      );
    }
  }

  /** Retains the declared payload types when looking up a known RPC. */
  public getRpcEndpoint<TName extends keyof TRpcEndpoints & string>(
    endpointName: TName,
  ): RpcEndpoint<TRpcEndpoints[TName]["parameter"], TRpcEndpoints[TName]["returns"]> | undefined;
  public getRpcEndpoint(endpointName: string): RpcEndpoint | undefined;
  public getRpcEndpoint(endpointName: string) {
    return this.rpcEndpoints.get(endpointName);
  }

  public getAllRpcEndpoints() {
    return [...this.rpcEndpoints.values()];
  }

  /** Retains both packet types when looking up a known channel. */
  public getChannelEndpoint<TName extends keyof TChannelEndpoints & string>(
    endpointName: TName,
  ):
    | ChannelEndpoint<
        TChannelEndpoints[TName]["creationParameter"],
        TChannelEndpoints[TName]["toServerPacket"],
        TChannelEndpoints[TName]["toClientPacket"]
      >
    | undefined;
  public getChannelEndpoint(endpointName: string): ChannelEndpoint | undefined;
  public getChannelEndpoint(endpointName: string) {
    return this.channelEndpoints.get(endpointName);
  }

  public getAllChannelEndpoints() {
    return [...this.channelEndpoints.values()];
  }

  /** Retains the declared signal type when looking up a known subscription. */
  public getSignalEndpoint<TName extends keyof TSignalEndpoints & string>(
    endpointName: TName,
  ):
    | SignalEndpoint<
        TSignalEndpoints[TName]["creationParameter"],
        TSignalEndpoints[TName]["signalData"]
      >
    | undefined;
  public getSignalEndpoint(endpointName: string): SignalEndpoint | undefined;
  public getSignalEndpoint(endpointName: string) {
    return this.signalEndpoints.get(endpointName);
  }

  public getAllSignalEndpoints() {
    return [...this.signalEndpoints.values()];
  }

  /** Retains the declared writable value type when looking up a known subscription. */
  public getWritableSignalEndpoint<TName extends keyof TWritableSignalEndpoints & string>(
    endpointName: TName,
  ):
    | WritableSignalEndpoint<
        TWritableSignalEndpoints[TName]["creationParameter"],
        TWritableSignalEndpoints[TName]["signalData"]
      >
    | undefined;
  public getWritableSignalEndpoint(endpointName: string): WritableSignalEndpoint | undefined;
  public getWritableSignalEndpoint(endpointName: string) {
    return this.writableSignalEndpoints.get(endpointName);
  }

  public getAllWritableSignalEndpoints() {
    return [...this.writableSignalEndpoints.values()];
  }
}

export type BackendInterfaceWithContext<TBackendInterface extends BackendInterface, TContext> =
  TBackendInterface extends BackendInterface<
    infer _ROriginalContext,
    infer RRpcEndpoints,
    infer RChannelEndpoints,
    infer RSignalEndpoints,
    infer RWritableSignalEndpoints
  >
    ? BackendInterface<
        TContext,
        RRpcEndpoints,
        RChannelEndpoints,
        RSignalEndpoints,
        RWritableSignalEndpoints
      >
    : never;
export type AnyBackendInterface = BackendInterface<any, any, any, any, any>;
export type ExtractBackendInterfaceRpcEndpoints<TBackendInterface extends AnyBackendInterface> =
  TBackendInterface extends BackendInterface<any, infer RRpcEndpoints, any, any, any>
    ? RRpcEndpoints
    : never;
export type ExtractBackendInterfaceChannelEndpoints<TBackendInterface extends AnyBackendInterface> =
  TBackendInterface extends BackendInterface<any, any, infer RChannelEndpoints, any, any>
    ? RChannelEndpoints
    : never;
export type ExtractBackendInterfaceSignalEndpoints<TBackendInterface extends AnyBackendInterface> =
  TBackendInterface extends BackendInterface<any, any, any, infer RSignalEndpoints, any>
    ? RSignalEndpoints
    : never;
export type ExtractBackendInterfaceWritableSignalEndpoints<
  TBackendInterface extends AnyBackendInterface,
> =
  TBackendInterface extends BackendInterface<any, any, any, any, infer RWritableSignalEndpoints>
    ? RWritableSignalEndpoints
    : never;
