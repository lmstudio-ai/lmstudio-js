/* eslint-disable @typescript-eslint/ban-types */
import { type NotAvailable, type Setter, type SignalLike } from "@lmstudio/lms-common";
import { type z, type ZodType } from "zod";
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

export interface RpcEndpoint {
  name: string;
  parameter: z.ZodType;
  returns: z.ZodType;
  serialization: SerializationType;
  handler: RpcEndpointHandler | null;
}

export interface ChannelEndpoint {
  name: string;
  creationParameter: z.ZodType;
  toServerPacket: z.ZodType;
  toClientPacket: z.ZodType;
  serialization: SerializationType;
  handler: ChannelEndpointHandler | null;
}

export interface SignalEndpoint {
  name: string;
  creationParameter: z.ZodType;
  signalData: z.ZodType;
  serialization: SerializationType;
  handler: SignalEndpointHandler | null;
}

export interface WritableSignalEndpoint {
  name: string;
  creationParameter: z.ZodType;
  signalData: z.ZodType;
  serialization: SerializationType;
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
    TParametersZod extends ZodType,
    TReturnsZod extends ZodType,
  >(
    endpointName: TEndpointName,
    {
      parameter,
      returns,
      serialization = "raw",
    }: {
      parameter: TParametersZod;
      returns: TReturnsZod;
      serialization?: SerializationType;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints & {
      [endpointName in TEndpointName]: {
        parameter: z.infer<TParametersZod>;
        returns: z.infer<TReturnsZod>;
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

  public addChannelEndpoint<
    TEndpointName extends string,
    TCreationParameterZod extends ZodType,
    TToServerPacketZod extends ZodType,
    TToClientPacketZod extends ZodType,
  >(
    endpointName: TEndpointName,
    {
      creationParameter,
      toServerPacket,
      toClientPacket,
      serialization = "raw",
    }: {
      creationParameter: TCreationParameterZod;
      toServerPacket: TToServerPacketZod;
      toClientPacket: TToClientPacketZod;
      serialization?: SerializationType;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints & {
      [endpointName in TEndpointName]: {
        creationParameter: z.infer<TCreationParameterZod>;
        toServerPacket: z.infer<TToServerPacketZod>;
        toClientPacket: z.infer<TToClientPacketZod>;
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

  public addSignalEndpoint<
    TEndpointName extends string,
    TCreationParameterZod extends ZodType,
    TSignalDataZod extends ZodType,
  >(
    endpointName: TEndpointName,
    {
      creationParameter,
      signalData,
      serialization = "raw",
    }: {
      creationParameter: TCreationParameterZod;
      signalData: TSignalDataZod;
      serialization?: SerializationType;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints & {
      [endpointName in TEndpointName]: {
        creationParameter: z.infer<TCreationParameterZod>;
        signalData: z.infer<TSignalDataZod>;
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
      handler: null,
    });
    return this;
  }

  public addWritableSignalEndpoint<
    TEndpointName extends string,
    TCreationParameterZod extends ZodType,
    TSignalDataZod extends ZodType,
  >(
    endpointName: TEndpointName,
    {
      creationParameter,
      signalData,
      serialization = "raw",
    }: {
      creationParameter: TCreationParameterZod;
      signalData: TSignalDataZod;
      serialization?: SerializationType;
    },
  ): BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints,
    TWritableSignalEndpoints & {
      [endpointName in TEndpointName]: {
        creationParameter: z.infer<TCreationParameterZod>;
        signalData: z.infer<TSignalDataZod>;
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

  public getRpcEndpoint(endpointName: string) {
    return this.rpcEndpoints.get(endpointName);
  }

  public getAllRpcEndpoints() {
    return [...this.rpcEndpoints.values()];
  }

  public getChannelEndpoint(endpointName: string) {
    return this.channelEndpoints.get(endpointName);
  }

  public getAllChannelEndpoints() {
    return [...this.channelEndpoints.values()];
  }

  public getSignalEndpoint(endpointName: string) {
    return this.signalEndpoints.get(endpointName);
  }

  public getAllSignalEndpoints() {
    return [...this.signalEndpoints.values()];
  }

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
