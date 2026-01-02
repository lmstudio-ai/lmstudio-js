import { SimpleLogger } from "@lmstudio/lms-common";
import { BackendInterface } from "@lmstudio/lms-communication";
import { type Context, type ContextCreator } from "@lmstudio/lms-communication-server";
import { createControllableMockedPorts } from "./createControllableMockedPorts.js";

/**
 * Creates a simple test context creator.
 */
function createTestContextCreator(): ContextCreator<Context> {
  return params => ({
    logger: new SimpleLogger(`Test:${params.endpointName}`),
  });
}

describe("createControllableMockedPorts", () => {
  it("should return isConnected() with correct state", () => {
    const backendInterface = new BackendInterface();

    const { isConnected, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
      backendInterface,
      createTestContextCreator(),
    );

    // Initially connected
    expect(isConnected()).toBe(true);

    // After disconnect
    simulateDisconnect();
    expect(isConnected()).toBe(false);

    // After reconnect
    simulateReconnect();
    expect(isConnected()).toBe(true);
  });

  it("should not double-disconnect or double-reconnect", () => {
    const backendInterface = new BackendInterface();

    const { isConnected, simulateDisconnect, simulateReconnect } = createControllableMockedPorts(
      backendInterface,
      createTestContextCreator(),
    );

    // Double disconnect should be idempotent
    simulateDisconnect();
    expect(isConnected()).toBe(false);
    simulateDisconnect(); // Should not throw
    expect(isConnected()).toBe(false);

    // Double reconnect should be idempotent
    simulateReconnect();
    expect(isConnected()).toBe(true);
    simulateReconnect(); // Should not throw
    expect(isConnected()).toBe(true);
  });
});
