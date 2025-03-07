import { z } from "zod";
import { type GPUSetting } from ".";

export const gpuSplitStrategies = ["evenly", "priorityOrder", "custom"] as const;
export type GPUSplitStrategy = (typeof gpuSplitStrategies)[number];
export const gpuSplitStrategySchema = z.enum(gpuSplitStrategies);

export const defaultGPUSplitConfig: GPUSplitConfig = {
  strategy: "evenly",
  disabledGpus: [],
  priority: [],
  customRatio: [],
};

/**
 * Settings related to splitting work across multiple GPUs.
 *
 * Not currently exposed through the SDK, deduced from GPUSetting.
 *
 * @public
 */
export type GPUSplitConfig = {
  /**
   * Different modalities for splitting work across multiple GPUs.
   */
  strategy: GPUSplitStrategy;
  /**
   * Indices of GPUs to disable. Not used when strategy is "custom".
   */
  disabledGpus: number[];
  /**
   * GPU indices in order of priority for offloading. Only used when strategy is "priorityOrder".
   */
  priority: number[];
  /**
   * Ratio array to assign how to split offloading between GPUs. Only used when strategy is
   * "custom", and if so ignores disabledGpus and priority.
   *
   * Examples:
   * [5, 2.5, 2,5] - 50% of model offload on GPU 0, 25% on GPU 1, 25% on GPU 2
   * [1, 1, 1] - Model evenly offloaded on all GPUs
   * [1, 0, 0] - Model offloaded only onto GPU 0
   */
  customRatio: number[];
};
export const gpuSplitConfigSchema = z.object({
  strategy: gpuSplitStrategySchema,
  disabledGpus: z.array(z.number().int().min(0)),
  priority: z.array(z.number().int().min(0)),
  customRatio: z.array(z.number().min(0)),
});

export function convertGPUSettingToGPUSplitConfig(gpuSetting?: GPUSetting): GPUSplitConfig {
  return {
    strategy:
      gpuSetting?.splitStrategy == "favorMainGpu"
        ? "priorityOrder"
        : gpuSetting?.splitStrategy ?? "evenly",
    disabledGpus: gpuSetting?.disabledGpus ?? [],
    priority: gpuSetting?.mainGpu ? [gpuSetting.mainGpu] : [],
    customRatio: [],
  };
}
