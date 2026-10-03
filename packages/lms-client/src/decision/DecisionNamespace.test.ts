import { SimpleLogger, Validator } from "@lmstudio/lms-common";
import { type DecisionPort } from "@lmstudio/lms-external-backend-interfaces";
import { collapseKVStack, decisionLlamaLoadConfigSchematics } from "@lmstudio/lms-kv-config";
import { type DecisionModelInstanceInfo, type KVConfigStack } from "@lmstudio/lms-shared-types";
import { type LMStudioClient } from "../LMStudioClient.js";
import { DecisionNamespace } from "./DecisionNamespace.js";

const info: DecisionModelInstanceInfo = {
  type: "decision",
  modelKey: "test/decision",
  format: "gguf",
  displayName: "Decision",
  publisher: "test",
  path: "test/decision.gguf",
  sizeBytes: 1,
  indexedModelIdentifier: "test/decision",
  deviceIdentifier: null,
  identifier: "decision",
  instanceReference: "instance",
  ttlMs: null,
  lastUsedTime: null,
  decisionType: "unfamiliar",
  hasVisionAdapter: true,
  contextLength: 8192,
};

test("decision SDK loads, reuses and unloads a model while preserving its info and load controls", async () => {
  const rpcs: Array<{ endpoint: string; parameters: unknown }> = [];
  let loaded = false;
  let config = decisionLlamaLoadConfigSchematics.buildPartialConfig({ contextLength: 8192 });
  const port = {
    createChannel(
      endpoint: string,
      parameters: { loadConfigStack: KVConfigStack },
      onMessage: (message: unknown) => void,
    ) {
      if (endpoint === "loadModel") {
        config = collapseKVStack(parameters.loadConfigStack);
      }
      queueMicrotask(() => {
        if (endpoint === "loadModel") {
          loaded = true;
          onMessage({ type: "success", info });
        } else if (endpoint === "getOrLoad") {
          onMessage({ type: "alreadyLoaded", info });
        } else {
          throw new Error(`Unexpected endpoint ${endpoint}`);
        }
      });
      return { onError: { subscribeOnce: () => {} }, send: () => {} };
    },
    async callRpc(endpoint: string, parameters: unknown) {
      rpcs.push({ endpoint, parameters });
      if (endpoint === "getModelInfo") {
        return loaded ? info : undefined;
      }
      if (endpoint === "getLoadConfig") {
        return config;
      }
      if (endpoint === "listLoaded") {
        return loaded ? [info] : [];
      }
      if (endpoint === "unloadModel") {
        loaded = false;
        return;
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
  } as unknown as DecisionPort;
  const namespace = new DecisionNamespace(
    {} as LMStudioClient,
    port,
    new SimpleLogger("DecisionSDKTest"),
    new Validator({ attachStack: false }),
  );
  const model = await namespace.load("test/decision", {
    verbose: false,
    config: { contextLength: 8192, physicalBatchSize: 256 },
  });
  expect(await model.getContextLength()).toBe(8192);
  expect(await model.getLoadConfig()).toMatchObject({
    contextLength: 8192,
    physicalBatchSize: 256,
  });
  expect((await namespace.listLoaded())[0].instanceReference).toBe("instance");
  expect((await namespace.model("decision", { verbose: false })).instanceReference).toBe(
    "instance",
  );
  await namespace.unload("decision");
  await expect(model.getModelInfo()).rejects.toThrow("already been unloaded");
  expect(rpcs.find(rpc => rpc.endpoint === "unloadModel")?.parameters).toMatchObject({
    identifier: "decision",
  });
});

test.each([
  { config: { autoFit: true, contextLength: 2048 }, message: "autoFit" },
  { config: { contextLength: 0 }, message: "contextLength" },
])(
  "decision SDK rejects invalid load controls $config before opening a load channel",
  async ({ config, message }) => {
    const createChannel = jest.fn();
    const namespace = new DecisionNamespace(
      {} as LMStudioClient,
      { createChannel } as unknown as DecisionPort,
      new SimpleLogger("DecisionSDKTest"),
      new Validator({ attachStack: false }),
    );
    await expect(
      namespace.load("test/decision", {
        verbose: false,
        config,
      }),
    ).rejects.toThrow(message);
    expect(createChannel).not.toHaveBeenCalled();
  },
);
