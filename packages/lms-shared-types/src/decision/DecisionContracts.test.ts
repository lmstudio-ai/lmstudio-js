import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decisionRequestSchema, decisionResultSchemaForRequest } from "./DecisionOperation.js";

// Read the wire JSON rather than object literals: prototype-like ids must remain own properties.
const fixtures: {
  operations: Array<{ name: string; request: unknown; result: unknown }>;
  acceptedImageRequests: Array<{ name: string; request: unknown }>;
  rejectedImageRequests: Array<{
    name: string;
    request: unknown;
    errorPath: Array<string | number>;
  }>;
} = JSON.parse(readFileSync(join(__dirname, "fixtures/systemOne.json"), "utf8"));

describe("System One contracts", () => {
  test.each(fixtures.operations)("preserves $name and its per-operation usage", fixture => {
    const request = decisionRequestSchema.parse(fixture.request);
    const result = decisionResultSchemaForRequest(request).parse(fixture.result);
    expect(request).toEqual(fixture.request);
    expect(result).toEqual(fixture.result);
    expect(JSON.stringify(request)).toBe(JSON.stringify(fixture.request));
    expect(JSON.stringify(result)).toBe(JSON.stringify(fixture.result));
  });

  test.each(fixtures.acceptedImageRequests)("accepts inline images in $name", fixture => {
    expect(decisionRequestSchema.parse(fixture.request)).toEqual(fixture.request);
  });

  test.each(fixtures.rejectedImageRequests)("rejects $name at the designated field", fixture => {
    const parsed = decisionRequestSchema.safeParse(fixture.request);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: fixture.errorPath,
            message: expect.stringContaining("base64"),
          }),
        ]),
      );
    }
  });

  test.each([null, 42, true, undefined, new Date(0), Number.NaN])(
    "invalid state %p produces a validation error, not an exception",
    state => {
      expect(
        decisionRequestSchema.safeParse({
          state,
          questions: { valid: { type: "noul", instructions: "Check" } },
        }).success,
      ).toBe(false);
    },
  );

  test("rejects non-JSON and cyclic nested content", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    for (const state of [{ nested: undefined }, { nested: Infinity }, cyclic]) {
      expect(
        decisionRequestSchema.safeParse({
          state,
          questions: { valid: { type: "noul", instructions: "Check" } },
        }).success,
      ).toBe(false);
    }
  });

  test("rejects invalid questions and criteria without throwing", () => {
    for (const questions of [null, [], {}, { invalid: null }, { invalid: { type: "other" } }]) {
      expect(decisionRequestSchema.safeParse({ state: "Test", questions }).success).toBe(false);
    }
    for (const criteria of [[], ["one"], Array.from({ length: 11 }, () => "level")]) {
      expect(
        decisionRequestSchema.safeParse({
          state: "Test",
          questions: { rating: { type: "score", instructions: "Rate", criteria } },
        }).success,
      ).toBe(false);
    }
  });

  test("prototype-like ids survive parsing without interpreting inherited properties", () => {
    const fixture = fixtures.operations.find(
      operation => operation.name === "prototype-like-question-and-option-ids",
    )!;
    const request = decisionRequestSchema.parse(fixture.request);
    expect(Object.hasOwn(request.questions, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(request.questions)).toBe(Object.prototype);
    const resultSchema = decisionResultSchemaForRequest(request);
    const result = resultSchema.parse(fixture.result);
    expect(Object.hasOwn(result.answers, "__proto__")).toBe(true);
    expect(resultSchema.safeParse({ ...result, answers: {} }).success).toBe(false);
  });

  test("rejects missing, foreign and mismatched answers and invalid probability ids", () => {
    const fixture = fixtures.operations[0];
    const request = decisionRequestSchema.parse(fixture.request);
    const resultSchema = decisionResultSchemaForRequest(request);
    const result = resultSchema.parse(fixture.result);
    const invalidAnswers = [
      null,
      { route: null },
      {},
      { other: result.answers.route },
      { ...result.answers, extra: result.answers.route },
      { route: { type: "noul", noul: 0.5 } },
      { route: { ...result.answers.route, choice: "foreign" } },
      { route: { ...result.answers.route, probabilities: { foreign: 1 } } },
      { route: { ...result.answers.route, confidence: Infinity } },
      { route: { ...result.answers.route, probabilities: { billing: -0.1, shipping: 1.1 } } },
    ];
    for (const answers of invalidAnswers) {
      expect(resultSchema.safeParse({ ...result, answers }).success).toBe(false);
    }
  });

  test("does not coerce fractional scores, numeric noul or token counts", () => {
    const scoreFixture = fixtures.operations[1];
    const scoreSchema = decisionResultSchemaForRequest(
      decisionRequestSchema.parse(scoreFixture.request),
    );
    const scoreResult = scoreSchema.parse(scoreFixture.result);
    for (const score of [-1, 3, Number.NaN, "1.25"]) {
      expect(
        scoreSchema.safeParse({
          ...scoreResult,
          answers: { quality: { ...scoreResult.answers.quality, score } },
        }).success,
      ).toBe(false);
    }
    const noulFixture = fixtures.operations[2];
    const noulSchema = decisionResultSchemaForRequest(
      decisionRequestSchema.parse(noulFixture.request),
    );
    const noulResult = noulSchema.parse(noulFixture.result);
    expect(
      noulSchema.safeParse({
        ...noulResult,
        answers: { ...noulResult.answers, true: { type: "noul", noul: true } },
      }).success,
    ).toBe(false);
    expect(
      noulSchema.safeParse({ ...noulResult, usage: { input_tokens: 0.5, output_tokens: 0 } })
        .success,
    ).toBe(false);
  });
});
