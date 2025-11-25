import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type RepositoryPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type ModelSearchResultEntryData,
  type ModelSearchResultMetadata,
} from "@lmstudio/lms-shared-types";
import { ModelSearchResultDownloadOption } from "./ModelSearchResultDownloadOption.js";

/** @public */
export class ModelSearchResultEntry {
  public readonly name: string;

  /**
   * Rich metadata for staff-picked models. Includes model type, capabilities, and stats.
   * Only present when the result comes from the catalog (staff picks).
   */
  public readonly metadata: ModelSearchResultMetadata | undefined;

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
    this.metadata = data.metadata;
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
      resultData =>
        new ModelSearchResultDownloadOption(
          this.repositoryPort,
          this.validator,
          this.logger,
          resultData,
        ),
    );
  }
}
