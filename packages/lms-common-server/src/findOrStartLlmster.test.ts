import { type LoggerInterface } from "@lmstudio/lms-common";
import { tryFindLocalAPIServer } from "./findOrStartLlmster.js";

const logger: LoggerInterface = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

/** Builds the status response returned by a real local API server. */
function statusResponse(): Response {
  return new Response(JSON.stringify({ package: "lmstudio", version: "1.2.3" }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("tryFindLocalAPIServer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses a live preferred port without scanning the legacy ports", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(statusResponse());

    await expect(tryFindLocalAPIServer(logger, 45678)).resolves.toEqual({
      package: "lmstudio",
      port: 45678,
      version: "1.2.3",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:45678/lms-status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("falls back to legacy discovery when the preferred port is stale", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async input => {
      const url = input.toString();
      if (url === "http://127.0.0.1:41343/lms-status") {
        return statusResponse();
      }
      throw new Error("Not listening");
    });

    await expect(tryFindLocalAPIServer(logger, 45678)).resolves.toEqual({
      package: "lmstudio",
      port: 41343,
      version: "1.2.3",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:45678/lms-status");
  });
});
