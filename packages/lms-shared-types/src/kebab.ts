import { z } from "zod";

export const kebabCaseRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const kebabCaseSchema = z.string().regex(kebabCaseRegex);

export const kebabCaseWithDotsRegex = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
export const kebabCaseWithDotsSchema = z.string().regex(kebabCaseWithDotsRegex);
