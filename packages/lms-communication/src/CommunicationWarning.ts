export const communicationWarningKinds = [
  "unknown",
  "channelUnknown",
  "channelMessageTypeError",
  "channelCreationParameterTypeError",
  "channelEndpointUnknown",
  "channelEndpointUnhandled",
  "channelAlreadyOpen",
  "rpcUnknown",
  "rpcParameterTypeError",
  "rpcResultTypeError",
  "rpcEndpointUnknown",
  "rpcEndpointUnhandled",
  "signalUnknown",
  "signalUpdatePatchApplyError",
  "signalPatchTypeError",
  "signalEndpointUnknown",
  "signalEndpointUnhandled",
  "signalAlreadyOpen",
  "signalCreationParameterTypeError",
  "writableSignalUnknown",
  "writableSignalPatchApplyError",
  "writableSignalPatchTypeError",
  "writableSignalDataTypeError",
  "writableSignalEndpointUnknown",
  "writableSignalEndpointUnhandled",
  "writableSignalAlreadyOpen",
  "writableSignalCreationParameterTypeError",
] as const;

export type CommunicationWarningKind = (typeof communicationWarningKinds)[number];

const communicationWarningKindsSet = new Set<string>(communicationWarningKinds);

export function normalizeCommunicationWarningKind(kind: string | undefined): CommunicationWarningKind {
  if (kind === undefined) {
    return "unknown";
  }
  if (!communicationWarningKindsSet.has(kind)) {
    return "unknown";
  }
  return kind as CommunicationWarningKind;
}
