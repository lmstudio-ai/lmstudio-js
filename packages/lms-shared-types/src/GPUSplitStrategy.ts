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
   * Indices of GPUs to disable.
   */
  disabledGpus: number[];
  /**
   * GPU indices in order of priority.
   */
  priority: number[];
  /**
   * Ratio array to assign how to split offloading between GPUs. Used if strategy is "custom".
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
