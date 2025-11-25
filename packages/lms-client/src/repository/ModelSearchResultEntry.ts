import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type RepositoryPort } from "@lmstudio/lms-external-backend-interfaces";
import { type ModelSearchResultEntryData } from "@lmstudio/lms-shared-types";
import { ModelSearchResultDownloadOption } from "./ModelSearchResultDownloadOption.js";

/** @public */
export class ModelSearchResultEntry {
  public readonly name: string;

  /**
   * @internal
   */
  public constructor(
    /** @internal */
    private readonly repositoryPort: RepositoryPort,
    /** @internal */
    private readonly validator: Validator,
    private readonly logger: SimpleLogger,
    private readonly data: ModelSearchResultEntryData,
  ) {
    this.name = data.name;
  }

  public isExactMatch(): boolean {
    return this.data.exact ?? false;
  }

  public isStaffPick(): boolean {
    return this.data.staffPick ?? false;
  }

  public async getDownloadOptions(): Promise<Array<ModelSearchResultDownloadOption>> {
    const { results } = await this.repositoryPort.callRpc("getModelDownloadOptions", {
      modelSearchResultIdentifier: this.data.identifier,
    });
    return results.map(
      data =>
        new ModelSearchResultDownloadOption(this.repositoryPort, this.validator, this.logger, data),
    );
  }
}
