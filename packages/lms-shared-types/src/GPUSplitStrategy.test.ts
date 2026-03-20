import { convertGPUSettingToGPUSplitConfig } from "./GPUSplitStrategy.js";

describe("convertGPUSettingToGPUSplitConfig", () => {
  it("preserves mainGpu 0 in priority order conversion", () => {
    expect(
      convertGPUSettingToGPUSplitConfig({
        mainGpu: 0,
        splitStrategy: "favorMainGpu",
      }),
    ).toEqual({
      strategy: "priorityOrder",
      disabledGpus: [],
      priority: [0],
      customRatio: [],
    });
  });
});
