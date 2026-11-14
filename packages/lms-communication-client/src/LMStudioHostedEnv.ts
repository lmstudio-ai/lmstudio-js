import {
  type ClientToServerMessage,
  type PDSFrame,
  type ServerToClientMessage,
} from "@lmstudio/lms-communication";

export interface LMStudioHostedEnv {
  /**
   * @param apiNamespace - The ID of the API to get a tunnel for.
   * @param initMessage - The message to send to the server when the tunnel is created.
   * @param onMessage - A callback to be called when a message or parallel data stream frame is
   * received from the server.
   * @param onClose - A callback to be called when the tunnel is closed.
   * @returns A function that can be used to send messages and frames to the server.
   */
  getApiIpcTunnel: (
    apiNamespace: string,
    initMessage: any,
    onMessage: (message: ServerToClientMessage | PDSFrame) => void,
    onClose: () => void,
  ) => (message: ClientToServerMessage | PDSFrame) => void;
}

export function getHostedEnv(): LMStudioHostedEnv | null {
  let anyWindow: any;
  try {
    anyWindow = window;
  } catch (error) {
    anyWindow = undefined;
  }
  if (anyWindow !== undefined && anyWindow.lmsHostedEnv !== undefined) {
    return anyWindow.lmsHostedEnv as LMStudioHostedEnv;
  }
  return null;
}
