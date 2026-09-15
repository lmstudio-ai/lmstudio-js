import { makePromise, SimpleLogger, Validator } from "@lmstudio/lms-common";
import { createLlmBackendInterface, type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { type LLMInstanceInfo } from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { LLMDynamicHandle } from "./LLMDynamicHandle.js";
import { unimplementedRawFunctionTool } from "./tool.js";

const packetSchema = createLlmBackendInterface().getChannelEndpoint("predict")!.toClientPacket;
const oldStartSchema = z.object({
  type: z.literal("toolCallGenerationStart"),
  toolCallId: z.string().optional(),
});
const modelInfo: LLMInstanceInfo = {
  type: "llm",
  modelKey: "test/model",
  format: "gguf",
  displayName: "Test",
  publisher: "test",
  path: "/test/model.gguf",
  sizeBytes: 0,
  indexedModelIdentifier: "test/model",
  deviceIdentifier: null,
  identifier: "test",
  instanceReference: "test",
  ttlMs: null,
  lastUsedTime: null,
  vision: false,
  trainedForToolUse: true,
  maxContextLength: 4096,
  contextLength: 4096,
};

function createHarness() {
  const ready = makePromise<void>();
  let receive: (packet: unknown) => void = () => {
    throw new Error("Channel not opened");
  };
  let rejectChannel: (error: Error) => void = () => {};
  const port = {
    createChannel: (_name: string, _parameter: unknown, onMessage: (packet: unknown) => void) => {
      receive = packet => onMessage(packetSchema.parse(packet));
      ready.resolve();
      return {
        onError: {
          subscribeOnce: (callback: (error: Error) => void) => {
            rejectChannel = callback;
          },
        },
        send: () => {},
      };
    },
  } as unknown as LLMPort;
  const handle = new LLMDynamicHandle(
    port,
    { type: "instanceReference", instanceReference: "test" },
    new Validator({ attachStack: false }),
    new SimpleLogger("toolArgumentsFormatTest"),
  );
  return {
    handle,
    ready: ready.promise,
    emit: (packet: unknown) => receive(packet),
    fail: (error: Error) => rejectChannel(error),
    finish: () =>
      receive({
        type: "success",
        stats: { stopReason: "eosFound" },
        modelInfo,
        loadModelConfig: { fields: [] },
        predictionConfig: { fields: [] },
      }),
  };
}

const lookup = unimplementedRawFunctionTool({
  name: "lookup",
  description: "Test only",
  parametersJsonSchema: { type: "object", properties: {} },
});

for (const api of ["respond", "act"] as const) {
  describe(`${api} tool argument format`, () => {
    test.each(["json", undefined] as const)(
      "forwards %s before end and resets for the next call",
      async argumentsFormat => {
        const harness = createHarness();
        const starts: unknown[] = [];
        const fragments: string[] = [];
        const ends = jest.fn();
        const prediction =
          api === "respond"
            ? harness.handle.respond("test", {
                onToolCallRequestStart: (_callId, info) => starts.push(info),
                onToolCallRequestArgumentFragmentGenerated: (_callId, content) =>
                  fragments.push(content),
                onToolCallRequestEnd: ends,
              })
            : harness.handle.act("test", [lookup], {
                onToolCallRequestStart: (_round, _callId, info) => starts.push(info),
                onToolCallRequestArgumentFragmentGenerated: (_round, _callId, content) =>
                  fragments.push(content),
                onToolCallRequestEnd: ends,
              });
        await harness.ready;
        harness.emit({ type: "toolCallGenerationStart", toolCallId: "engine-0", argumentsFormat });
        harness.emit({ type: "toolCallGenerationNameReceived", name: "lookup" });
        harness.emit({
          type: "toolCallGenerationArgumentFragmentGenerated",
          content: '{ "text": "hel',
        });
        expect(starts).toEqual([{ toolCallId: "engine-0", argumentsFormat }]);
        expect(fragments).toEqual(['{ "text": "hel']);
        expect(ends).not.toHaveBeenCalled();
        harness.emit({ type: "toolCallGenerationArgumentFragmentGenerated", content: 'lo" }' });
        harness.emit({
          type: "toolCallGenerationEnd",
          toolCallRequest: {
            type: "function",
            id: "engine-0",
            name: "lookup",
            arguments: { text: "hello" },
          },
        });
        // An older/native producer has no format field. The SDK still provides its existing
        // one-shot fallback when no argument fragment arrived, without leaking the prior marker.
        harness.emit({ type: "toolCallGenerationStart", toolCallId: "engine-1" });
        harness.emit({
          type: "toolCallGenerationEnd",
          toolCallRequest: {
            type: "function",
            id: "engine-1",
            name: "lookup",
            arguments: {},
          },
        });
        harness.finish();
        await prediction;
        expect(starts).toEqual([
          { toolCallId: "engine-0", argumentsFormat },
          { toolCallId: "engine-1", argumentsFormat: undefined },
        ]);
        expect(fragments).toEqual(['{ "text": "hel', 'lo" }', "{}"]);
        expect(ends).toHaveBeenCalledTimes(2);
      },
    );

    test("retains transport failure after a marked partial call", async () => {
      const harness = createHarness();
      const failure = jest.fn();
      const prediction =
        api === "respond"
          ? harness.handle.respond("test", { onToolCallRequestFailure: failure })
          : harness.handle.act("test", [lookup], { onToolCallRequestFailure: failure });
      const rejected = expect(Promise.resolve(prediction)).rejects.toThrow("transport failed");
      await harness.ready;
      harness.emit({
        type: "toolCallGenerationStart",
        toolCallId: "engine-0",
        argumentsFormat: "json",
      });
      harness.emit({ type: "toolCallGenerationNameReceived", name: "lookup" });
      harness.emit({ type: "toolCallGenerationArgumentFragmentGenerated", content: '{"text":' });
      harness.fail(new Error("transport failed"));
      await rejected;
    });
  });
}

describe("optional tool-start wire metadata", () => {
  test("new schema accepts old packets; old schema ignores the new field", () => {
    const oldPacket = { type: "toolCallGenerationStart", toolCallId: "engine-0" };
    const newPacket = { ...oldPacket, argumentsFormat: "json" };
    expect(packetSchema.parse(oldPacket)).toEqual(oldPacket);
    expect(packetSchema.parse(newPacket)).toEqual(newPacket);
    expect(oldStartSchema.parse(newPacket)).toEqual(oldPacket);
  });
});
