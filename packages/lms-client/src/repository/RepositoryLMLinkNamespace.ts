import { getCurrentStack, type LoggerInterface, SimpleLogger } from "@lmstudio/lms-common";
import { type RepositoryPort } from "@lmstudio/lms-external-backend-interfaces";
import { type LMLinkStatusResult } from "@lmstudio/lms-shared-types";

/**
 * LM Link management APIs.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export class RepositoryLMLinkNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    private readonly repositoryPort: RepositoryPort,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Unstable", parentLogger);
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public async setDisabled(disabled: boolean): Promise<void> {
    const stack = getCurrentStack(1);
    return await this.repositoryPort.callRpc("lmLinkSetDisabled", { disabled }, { stack });
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public async status(): Promise<LMLinkStatusResult> {
    const stack = getCurrentStack(1);
    return await this.repositoryPort.callRpc("lmLinkStatus", undefined, { stack });
  }

  /** Reports the saved agent opt-in, or effective policy for a managed Runner. */
  public async getAgentStatus(): Promise<{ enabled: boolean; managed: boolean }> {
    const stack = getCurrentStack(1);
    return await this.repositoryPort.callRpc("lmLinkGetAgentStatus", undefined, { stack });
  }

  /** Changes the host's agent opt-in. Managed Runners are controlled by Runner policy. */
  public async setAgentEnabled(enabled: boolean): Promise<void> {
    const stack = getCurrentStack(1);
    return await this.repositoryPort.callRpc("lmLinkSetAgentEnabled", { enabled }, { stack });
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public async updateDeviceName(deviceName: string): Promise<void> {
    const stack = getCurrentStack(1);
    return await this.repositoryPort.callRpc("lmLinkUpdateDeviceName", { deviceName }, { stack });
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public async setPreferredDevice(deviceIdentifier: string): Promise<void> {
    const stack = getCurrentStack(1);
    return await this.repositoryPort.callRpc(
      "lmLinkSetPreferredDevice",
      { deviceIdentifier },
      { stack },
    );
  }
}
