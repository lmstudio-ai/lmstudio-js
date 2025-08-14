import { existsSync } from "fs";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { type LLM, LMStudioClient } from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwenVL } from "../shared.heavy.test.js";

describe("LLM with vision", () => {
  let client: LMStudioClient;
  let model: LLM;
  let filePath: string;
  let imageContent: ArrayBuffer;
  beforeAll(async () => {
    client = new LMStudioClient();
    await ensureHeavyTestsEnvironment(client);
    imageContent = await fetch(
      "https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.jpg",
    ).then(response => response.arrayBuffer());
    filePath = join(tmpdir(), "w3c_home_" + Date.now() + ".jpg");
    await writeFile(filePath, new Uint8Array(imageContent));
  }, 60_000);
  afterAll(async () => {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  });
  beforeEach(async () => {
    model = await client.llm.model(llmTestingQwenVL, {
      verbose: false,
      config: {
        llamaKCacheQuantizationType: "f32",
        llamaVCacheQuantizationType: "f32",
      },
    });
  }, 60_000);
  it("should work with base64 upload", async () => {
    const image = await client.files.prepareImageBase64(
      "w3c_home.jpg",
      Buffer.from(new Uint8Array(imageContent)).toString("base64"),
    );
    const result = await model.respond(
      { content: "What do you see?", images: [image] },
      { temperature: 0, maxTokens: 10 },
    );
    expect(result.content).toMatchSnapshot();
    expect(result.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
    });
    expect(result.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(typeof (await image.getFilePath())).toBe("string");
    expect(typeof image.identifier).toBe("string");
    expect(image.sizeBytes).toMatchInlineSnapshot(`2165`);
    expect(image.type).toBe("image");
  });
  it("should work with file upload", async () => {
    const image = await client.files.prepareImage(filePath);
    const result = await model.respond(
      { content: "What do you see?", images: [image] },
      { temperature: 0, maxTokens: 10 },
    );
    expect(result.content).toMatchSnapshot();
    expect(result.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
    });
    expect(result.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(typeof (await image.getFilePath())).toBe("string");
    expect(typeof image.identifier).toBe("string");
    expect(image.sizeBytes).toMatchInlineSnapshot(`2165`);
    expect(image.type).toBe("image");
  });
});
