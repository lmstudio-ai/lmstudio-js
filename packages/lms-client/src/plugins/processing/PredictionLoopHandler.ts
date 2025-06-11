import { z } from "zod";
import { type PredictionLoopHandlerController } from "./ProcessingController.js";

/**
 * TODO: Documentation
 *
 * @public
 */
export type PredictionLoopHandler = (ctl: PredictionLoopHandlerController) => Promise<void>;
export const predictionLoopHandlerSchema = z.function();
