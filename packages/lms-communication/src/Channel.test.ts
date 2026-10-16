import { Channel, ConnectionStatus } from "./Channel.js";

describe("Channel termination", () => {
  test.each(["closed", "errored"] as const)(
    "%s settles ACKs and prevents further sends",
    async terminal => {
      const send = jest.fn();
      const control = Channel.create<string, string>(send);
      const errors = jest.fn();
      const closes = jest.fn();
      control.channel.onError.subscribe(errors);
      control.channel.onClose.subscribe(closes);
      const pending = expect(control.channel.sendAndWaitForACK("first")).rejects.toThrow();

      if (terminal === "closed") {
        control.closed();
        control.errored(new Error("late error"));
      } else {
        control.errored(new Error("conversion failed"));
        control.closed();
      }
      control.closed();
      control.errored(new Error("duplicate error"));
      await pending;
      await expect(control.channel.sendAndWaitForACK("later")).rejects.toThrow(
        "terminated channel",
      );
      expect(() => control.channel.send("later")).toThrow("terminated channel");
      expect(send).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalledTimes(terminal === "errored" ? 1 : 0);
      expect(closes).toHaveBeenCalledTimes(terminal === "closed" ? 1 : 0);
      expect(control.channel.connectionStatus.get()).toBe(
        terminal === "closed" ? ConnectionStatus.Closed : ConnectionStatus.Errored,
      );
    },
  );

  test("a synchronous send failure rejects its ACK promise", async () => {
    const control = Channel.create<string, string>(() => {
      throw new Error("send failed");
    });
    await expect(control.channel.sendAndWaitForACK("packet")).rejects.toThrow("send failed");
  });
});
