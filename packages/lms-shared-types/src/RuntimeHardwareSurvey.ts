import { z, type ZodSchema } from "zod";
import { modelFormatNameSchema, type ModelFormatName } from "./RuntimeCommon.js";
import { runtimeEngineSpecifierSchema, type RuntimeEngineSpecifier } from "./RuntimeEngine.js";

/**
 * Controls which engines are included in a hardware survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareSurveyScope =
  | { type: "selected" }
  | { type: "all" }
  | { type: "custom"; engines: RuntimeEngineSpecifier[] };
export const runtimeHardwareSurveyScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("selected") }),
  z.object({ type: z.literal("all") }),
  z.object({
    type: z.literal("custom"),
    engines: z.array(runtimeEngineSpecifierSchema),
  }),
]) as ZodSchema<RuntimeHardwareSurveyScope>;

/**
 * Overall status for a hardware survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareSurveyStatus = "ok" | "noCompatibleBackends";
export const runtimeHardwareSurveyStatusSchema = z.enum([
  "ok",
  "noCompatibleBackends",
]) as ZodSchema<RuntimeHardwareSurveyStatus>;

/**
 * Compatibility status for a runtime engine.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareSurveyCompatibilityStatus =
  | "compatible"
  | "incompatibleAppVersion"
  | "incompatibleBackendVersion"
  | "invalidCpuArchitecture"
  | "invalidCpuInstructionSetExtensions"
  | "cpuSurveyUnsuccessful"
  | "gpuSurveyUnsuccessful"
  | "gpuRequiredButNoneFound"
  | "gpuTargetsRequiredButNoneSpecified"
  | "gpuDriverUnsupported"
  | "noSupportedGpus"
  | "incompatiblePlatform"
  | "libraryOutdated"
  | "invalidLibraryVersionFormat"
  | "missingLibraries"
  | "errorSurveyingHardware"
  | "errorCheckingCompatibility"
  | "unknown";
export const runtimeHardwareSurveyCompatibilityStatusSchema = z.enum([
  "compatible",
  "incompatibleAppVersion",
  "incompatibleBackendVersion",
  "invalidCpuArchitecture",
  "invalidCpuInstructionSetExtensions",
  "cpuSurveyUnsuccessful",
  "gpuSurveyUnsuccessful",
  "gpuRequiredButNoneFound",
  "gpuTargetsRequiredButNoneSpecified",
  "gpuDriverUnsupported",
  "noSupportedGpus",
  "incompatiblePlatform",
  "libraryOutdated",
  "invalidLibraryVersionFormat",
  "missingLibraries",
  "errorSurveyingHardware",
  "errorCheckingCompatibility",
  "unknown",
]) as ZodSchema<RuntimeHardwareSurveyCompatibilityStatus>;

/**
 * Compatibility status and optional message for a runtime engine.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyCompatibility {
  status: RuntimeHardwareSurveyCompatibilityStatus;
  message?: string;
}
export const runtimeHardwareSurveyCompatibilitySchema = z.object({
  status: runtimeHardwareSurveyCompatibilityStatusSchema,
  message: z.string().optional(),
}) as ZodSchema<RuntimeHardwareSurveyCompatibility>;

/**
 * High-level result codes for a hardware survey step.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareSurveyResultCode =
  | "unset"
  | "success"
  | "error"
  | "noDevicesFound"
  | "invalidDevice";
export const runtimeHardwareSurveyResultCodeSchema = z.enum([
  "unset",
  "success",
  "error",
  "noDevicesFound",
  "invalidDevice",
]) as ZodSchema<RuntimeHardwareSurveyResultCode>;

/**
 * Result code and message for a single survey step.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyResultInfo {
  code: RuntimeHardwareSurveyResultCode;
  message: string;
}
export const runtimeHardwareSurveyResultInfoSchema = z.object({
  code: runtimeHardwareSurveyResultCodeSchema,
  message: z.string(),
}) as ZodSchema<RuntimeHardwareSurveyResultInfo>;

/**
 * CPU architecture reported by the survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareCpuArchitecture = "x86_64" | "ARM64" | "unknown";
export const runtimeHardwareCpuArchitectureSchema = z.enum([
  "x86_64",
  "ARM64",
  "unknown",
]) as ZodSchema<RuntimeHardwareCpuArchitecture>;

/**
 * CPU instruction set extensions reported by the survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareCpuInstructionSetExtension = "AVX2" | "AdvSIMD" | "AVX";
export const runtimeHardwareCpuInstructionSetExtensionSchema = z.enum([
  "AVX2",
  "AdvSIMD",
  "AVX",
]) as ZodSchema<RuntimeHardwareCpuInstructionSetExtension>;

/**
 * CPU details gathered during the survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareCpuInfo {
  name?: string;
  architecture: RuntimeHardwareCpuArchitecture;
  supportedInstructionSetExtensions: RuntimeHardwareCpuInstructionSetExtension[];
}
export const runtimeHardwareCpuInfoSchema = z.object({
  name: z.string().optional(),
  architecture: runtimeHardwareCpuArchitectureSchema,
  supportedInstructionSetExtensions: z.array(runtimeHardwareCpuInstructionSetExtensionSchema),
}) as ZodSchema<RuntimeHardwareCpuInfo>;

/**
 * CPU survey result details.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareCpuSurveyResult {
  result: RuntimeHardwareSurveyResultInfo;
  cpuInfo?: RuntimeHardwareCpuInfo;
}
export const runtimeHardwareCpuSurveyResultSchema = z.object({
  result: runtimeHardwareSurveyResultInfoSchema,
  cpuInfo: runtimeHardwareCpuInfoSchema.optional(),
}) as ZodSchema<RuntimeHardwareCpuSurveyResult>;

/**
 * The platform used to detect GPUs.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareGpuDetectionPlatform =
  | "unknown"
  | "shell"
  | "ROCm"
  | "CUDA"
  | "OpenCl"
  | "Metal"
  | "Vulkan";
export const runtimeHardwareGpuDetectionPlatformSchema = z.enum([
  "unknown",
  "shell",
  "ROCm",
  "CUDA",
  "OpenCl",
  "Metal",
  "Vulkan",
]) as ZodSchema<RuntimeHardwareGpuDetectionPlatform>;

/**
 * GPU integration class for detected devices.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeHardwareGpuIntegrationType = "unknown" | "integrated" | "discrete";
export const runtimeHardwareGpuIntegrationTypeSchema = z.enum([
  "unknown",
  "integrated",
  "discrete",
]) as ZodSchema<RuntimeHardwareGpuIntegrationType>;

/**
 * Details for a detected GPU device.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareGpuInfo {
  name: string;
  deviceId: number;
  totalMemoryCapacityBytes: number;
  dedicatedMemoryCapacityBytes: number;
  integrationType: RuntimeHardwareGpuIntegrationType;
  detectionPlatform: RuntimeHardwareGpuDetectionPlatform;
  detectionPlatformVersion: string;
  otherInfo: Record<string, string>;
}
export const runtimeHardwareGpuInfoSchema = z.object({
  name: z.string(),
  deviceId: z.number(),
  totalMemoryCapacityBytes: z.number(),
  dedicatedMemoryCapacityBytes: z.number(),
  integrationType: runtimeHardwareGpuIntegrationTypeSchema,
  detectionPlatform: runtimeHardwareGpuDetectionPlatformSchema,
  detectionPlatformVersion: z.string(),
  otherInfo: z.record(z.string()),
}) as ZodSchema<RuntimeHardwareGpuInfo>;

/**
 * GPU survey result details.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareGpuSurveyResult {
  result: RuntimeHardwareSurveyResultInfo;
  gpuInfo: RuntimeHardwareGpuInfo[];
}
export const runtimeHardwareGpuSurveyResultSchema = z.object({
  result: runtimeHardwareSurveyResultInfoSchema,
  gpuInfo: z.array(runtimeHardwareGpuInfoSchema),
}) as ZodSchema<RuntimeHardwareGpuSurveyResult>;

/**
 * CPU and GPU survey results for a runtime engine.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyHardware {
  gpuSurveyResult: RuntimeHardwareGpuSurveyResult;
  cpuSurveyResult: RuntimeHardwareCpuSurveyResult;
}
export const runtimeHardwareSurveyHardwareSchema = z.object({
  gpuSurveyResult: runtimeHardwareGpuSurveyResultSchema,
  cpuSurveyResult: runtimeHardwareCpuSurveyResultSchema,
}) as ZodSchema<RuntimeHardwareSurveyHardware>;

/**
 * Memory totals reported by the hardware survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyMemoryInfo {
  ramCapacity: number;
  vramCapacity: number;
  totalMemory: number;
}
export const runtimeHardwareSurveyMemoryInfoSchema = z.object({
  ramCapacity: z.number(),
  vramCapacity: z.number(),
  totalMemory: z.number(),
}) as ZodSchema<RuntimeHardwareSurveyMemoryInfo>;

/**
 * GPU visibility configuration applied during the survey.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyVisibleDevicesConfig {
  visibleDevices: number[];
  changesOrder: boolean;
}
export const runtimeHardwareSurveyVisibleDevicesConfigSchema = z.object({
  visibleDevices: z.array(z.number()),
  changesOrder: z.boolean(),
}) as ZodSchema<RuntimeHardwareSurveyVisibleDevicesConfig>;

/**
 * Survey results for a single runtime engine.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyEngine {
  name: string;
  version: string;
  engine: string;
  platform: string;
  compatibility: RuntimeHardwareSurveyCompatibility;
  supportedModelFormatNames: ModelFormatName[];
  hardwareSurvey: RuntimeHardwareSurveyHardware;
  memoryInfo: RuntimeHardwareSurveyMemoryInfo;
  visibleDevicesConfig?: RuntimeHardwareSurveyVisibleDevicesConfig;
}
export const runtimeHardwareSurveyEngineSchema = z.object({
  name: z.string(),
  version: z.string(),
  engine: z.string(),
  platform: z.string(),
  compatibility: runtimeHardwareSurveyCompatibilitySchema,
  supportedModelFormatNames: z.array(modelFormatNameSchema),
  hardwareSurvey: runtimeHardwareSurveyHardwareSchema,
  memoryInfo: runtimeHardwareSurveyMemoryInfoSchema,
  visibleDevicesConfig: runtimeHardwareSurveyVisibleDevicesConfigSchema.optional(),
}) as ZodSchema<RuntimeHardwareSurveyEngine>;

/**
 * Top-level hardware survey result.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeHardwareSurveyResult {
  status: RuntimeHardwareSurveyStatus;
  engines: RuntimeHardwareSurveyEngine[];
}
export const runtimeHardwareSurveyResultSchema = z.object({
  status: runtimeHardwareSurveyStatusSchema,
  engines: z.array(runtimeHardwareSurveyEngineSchema),
}) as ZodSchema<RuntimeHardwareSurveyResult>;
