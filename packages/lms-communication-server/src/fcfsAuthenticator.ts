import {
  BufferedEvent,
  CancelEvent,
  SimpleLogger,
  SyncEvent,
  text,
  type LoggerInterface,
} from "@lmstudio/lms-common";
import { type AuthPacket } from "@lmstudio/lms-communication";
import { type ClientHolder } from "./AuthenticatedWsServer.js";
import { Authenticator, type ContextCreator } from "./Authenticator.js";

const clientHolderDropped = Symbol("clientHolderDropped");
const clientHolderLeaked = Symbol("clientHolderLeaked");

export class FcfsAuthenticatedContext {
  public constructor(
    public readonly requestType: "rpc" | "channel" | "signal" | "writableSignal",
    public readonly requestEndpoint: string,
    public readonly logger: SimpleLogger,
    public readonly client: FcfsClient,
    public readonly clientIdentifier: string,
  ) {}
}

class FcfsClientHolder implements ClientHolder {
  private dropped = false;
  public constructor(private readonly client: FcfsClient) {}
  public drop() {
    if (this.dropped) {
      throw new Error("ClientHolder already dropped!");
    }
    this.dropped = true;
    this.client[clientHolderDropped](this);
  }
  public leak() {
    if (this.dropped) {
      throw new Error("ClientHolder already dropped!");
    }
    this.dropped = true;
    this.client[clientHolderLeaked](this);
  }
}

export class FcfsClient {
  /**
   * Number of references to the client. When it reaches 0, the client is released.
   *
   * Special value -1: The client has just been created. Next increase will bring it to 1.
   */
  private references = -1;
  private clientHoldersFinalizationRegistry = new FinalizationRegistry(() => {
    this.decreaseReferences();
    this.logger.warnText`
      ClientHolder finalized without dropping! FinalizationRegistry is the last resort and should
      not be relied upon.

      When a connection is closed, the ClientHolder#drop method must be called to release the
      client.
    `;
  });
  public readonly logger: SimpleLogger;
  public readonly releaseEvent = new CancelEvent();

  /**
   * Creates a new client. Returns the client and a holder for the client. The holder must be
   * dropped when the connection holding this client is closed. More holders can be created by
   * calling the hold method of the client.
   *
   * @param clientIdentifier - The identifier of the client
   * @param clientPasskey - The passkey of the client
   * @param releaseCallback - A callback that is called when the client is no longer needed (i.e.
   * all holders are dropped.)
   * @param parentLogger - The parent logger
   * @returns The client and a holder for the client
   */
  public static create(
    clientIdentifier: string,
    clientPasskey: string,
    releaseCallback: (client: FcfsClient) => void,
    logger?: LoggerInterface,
  ): { client: FcfsClient; holder: ClientHolder } {
    const client = new FcfsClient(clientIdentifier, clientPasskey, releaseCallback, logger);
    return { client, holder: client.hold() };
  }
  protected constructor(
    public readonly clientIdentifier: string,
    protected readonly clientPasskey: string,
    private readonly onReleaseCallback: (client: FcfsClient) => void,
    parentLogger?: LoggerInterface,
  ) {
    this.logger = new SimpleLogger(`Client=${clientIdentifier}`, parentLogger);
    this.logger.debug("Client created.");
  }
  private released = false;
  protected onRelease() {
    this.released = true;
    this.onReleaseCallback(this);
    this.releaseEvent.cancel();
  }
  public async assertValid(authPacket: AuthPacket) {
    if (authPacket.clientIdentifier !== this.clientIdentifier) {
      // Should not happen.
      throw new Error("Failed to validate client: Invalid client identifier");
    }
    if (authPacket.clientPasskey !== this.clientPasskey) {
      throw new Error(text`
        Failed to validate client: Invalid client passkey for client
        "${authPacket.clientIdentifier}"
      `);
    }
  }

  /**
   * Force terminates the client. Cut all connections associated with the client and release the
   * client.
   */
  public forceTerminate() {
    this.onRelease();
  }

  /**
   * Creates a new holder for the client, which bumps the reference count of the client.
   */
  public hold(): ClientHolder {
    if (this.references === 0) {
      throw new Error("Client is already released!");
    } else if (this.references === -1) {
      this.references = 1;
    } else {
      this.references++;
    }
    const holder = new FcfsClientHolder(this);
    this.clientHoldersFinalizationRegistry.register(holder, undefined, holder);
    // this.logger.debug("Holder created, references:", this.references);
    return holder;
  }
  private decreaseReferences() {
    this.references--;
    // this.logger.debug("Holder released, references:", this.references);
    if (this.references === 0) {
      this.logger.debug("Client disconnected.");
      this.onRelease();
    }
  }

  /**
   * Internal method for the holder to call when it is dropped.
   */
  public [clientHolderDropped](holder: FcfsClientHolder) {
    this.clientHoldersFinalizationRegistry.unregister(holder);
    if (this.released) {
      // The client is already released. This can happen if the client is force terminated. In this
      // case, we don't need to decrease the reference count.
      return;
    }
    this.decreaseReferences();
  }
  /**
   * Internal method for the holder to call when it is leaked.
   */
  public [clientHolderLeaked](holder: FcfsClientHolder) {
    this.clientHoldersFinalizationRegistry.unregister(holder);
  }
}

/**
 * A very basic implementation of a First-come-first-server authenticator.
 *
 * Maintains a list of clients with a map. For each client identifier, the first one that connects
 * is trusted.
 *
 * @typeParam TContext - The actual context type authenticated by this authenticator. Exposed as a
 * generic type for inheritance purposes
 * @typeParam TClient - The client type to be used by this authenticator. Exposed as a generic type
 * for inheritance purposes
 *
 */
export abstract class FcfsAuthenticatorBase<
  TContext extends FcfsAuthenticatedContext = FcfsAuthenticatedContext,
  TClient extends FcfsClient = FcfsClient,
> extends Authenticator<TContext> {
  /**
   * A event that is emitted when a client is released.
   */
  public readonly clientReleasedEvent: SyncEvent<TClient>;
  protected readonly emitClientReleasedEvent: (client: TClient) => void;

  public readonly clientCreatedEvent: SyncEvent<TClient>;
  protected readonly emitClientCreatedEvent: (client: TClient) => void;

  public constructor() {
    super();
    [this.clientReleasedEvent, this.emitClientReleasedEvent] = SyncEvent.create();
    [this.clientCreatedEvent, this.emitClientCreatedEvent] = SyncEvent.create();
  }
  protected readonly clients = new Map<
    string,
    TClient | Promise<{ holder: ClientHolder; client: TClient }>
  >();
  protected abstract createClientAndFirstHolder(authPacket: AuthPacket): Promise<{
    holder: ClientHolder;
    client: TClient;
  }>;
  protected abstract createContextCreator(client: TClient): Promise<ContextCreator<TContext>>;
  /**
   * Allows to reserve certain client identifiers for manual creation only.
   */
  protected isClientAllowedForNewAuthenticatedClient(_authPacket: AuthPacket): boolean {
    return true;
  }
  public forceTerminate(clientIdentifier: string) {
    const client = this.clients.get(clientIdentifier);
    if (client === undefined) {
      throw new Error(text`
        Client ${clientIdentifier} not found. Available: ${[...this.clients.keys()]}
      `);
    }
    if (client instanceof Promise) {
      throw new Error("Client is not yet created.");
    }
    client.forceTerminate();
  }
  /**
   * Authenticates a request. Returns a client holder and a context.
   *
   * If failed to authenticate, an error will be thrown.
   *
   * @param authPacket - The authentication packet
   * @returns The client holder and the context
   */
  public override async authenticate(authPacket: AuthPacket): Promise<{
    holder: ClientHolder;
    contextCreator: ContextCreator<TContext>;
    authenticationRevokedEvent: BufferedEvent<void>;
  }> {
    let client = this.clients.get(authPacket.clientIdentifier);
    let holder: ClientHolder;
    if (client === undefined) {
      const isAllowed = this.isClientAllowedForNewAuthenticatedClient(authPacket);
      if (!isAllowed) {
        throw new Error(`Provided authPacket ${authPacket.clientIdentifier} is not allowed.`);
      }
      const clientPromise = this.createClientAndFirstHolder(authPacket);
      this.clients.set(authPacket.clientIdentifier, clientPromise);
      ({ client, holder } = await clientPromise);
      this.clients.set(authPacket.clientIdentifier, client);
      this.emitClientCreatedEvent(client);
    } else {
      if (client instanceof Promise) {
        ({ client } = await client);
      }
      holder = client.hold();
    }
    try {
      await client.assertValid(authPacket);
      const contextCreator = await this.createContextCreator(client);
      const [authenticationRevokedEvent, emitAuthenticationRevokedEvent] =
        BufferedEvent.create<void>();
      client.releaseEvent.subscribe(() => {
        emitAuthenticationRevokedEvent();
      });
      return { holder, contextCreator, authenticationRevokedEvent };
    } catch (error) {
      holder.drop();
      throw error;
    }
  }
}

export class FcfsAuthenticator extends FcfsAuthenticatorBase {
  protected readonly logger: SimpleLogger;
  public constructor(parentLogger?: LoggerInterface) {
    super();
    this.logger = new SimpleLogger("FcfsAuthenticator", parentLogger);
  }
  protected override async createClientAndFirstHolder(authPacket: AuthPacket) {
    const { client, holder } = FcfsClient.create(
      authPacket.clientIdentifier,
      authPacket.clientPasskey,
      this.emitClientReleasedEvent,
      this.logger,
    );
    return { holder, client };
  }
  protected override async createContextCreator(
    client: FcfsClient,
  ): Promise<ContextCreator<FcfsAuthenticatedContext>> {
    return ({ type, endpointName }) =>
      new FcfsAuthenticatedContext(
        type,
        endpointName,
        new SimpleLogger(`FcfsAuthenticatedContext(ep=${endpointName},t=${type})`, client.logger),
        client,
        client.clientIdentifier,
      );
  }
}
