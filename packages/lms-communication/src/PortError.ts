export interface PortErrorContext {
  endpointName: string;
  endpointKind: "rpc" | "channel" | "signal" | "writableSignal";
}

/** Formats locally caught endpoint failures before rejection or serialization. Peer errors bypass it. */
export type PortErrorMapper = (error: unknown, context: PortErrorContext) => unknown;

/** Keeps error formatting from interrupting operation cleanup. */
export function mapPortError(
  mapper: PortErrorMapper | undefined,
  error: unknown,
  endpointName: string,
  endpointKind: PortErrorContext["endpointKind"],
): unknown {
  try {
    return mapper === undefined ? error : mapper(error, { endpointName, endpointKind });
  } catch {
    return error;
  }
}
