import {
  deserialize,
  serialize,
  type SerializationType,
  type SerializedOpaque,
} from "./serialization.js";

/** The endpoint only needs a parser and its output type. */
export interface PayloadSchema<TValue = unknown> {
  parse(value: unknown): TValue;
}
export type InferPayloadSchema<TSchema extends PayloadSchema> = ReturnType<TSchema["parse"]>;

interface PayloadCodecEncodeOpts<TValue> {
  schema: PayloadSchema<TValue>;
  value: TValue;
  serialization?: SerializationType;
}
interface PayloadCodecDecodeOpts<TValue> {
  schema: PayloadSchema<TValue>;
  value: unknown;
  serialization?: SerializationType;
}
export type PayloadDecodeResult<TValue> =
  | { success: true; data: TValue }
  | { success: false; error: Error };

/** Binds endpoint payload handling to one port without changing its backend interface. */
export class PayloadCodec {
  /** Converts a local value before the endpoint's serializer runs. */
  public toWire<TValue>(_schema: PayloadSchema<TValue>, value: TValue): unknown {
    return value;
  }

  /** Validates an incoming value and returns the value expected by local handlers. */
  protected fromWire<TValue>(schema: PayloadSchema<TValue>, value: unknown): TValue {
    return schema.parse(value);
  }

  /** Reports whether signal patches address the same structure on both sides. */
  public preservesPatches(_schema: PayloadSchema): boolean {
    return true;
  }

  /** Encodes a complete payload once the connection's format is known. */
  public encode<TValue>({
    schema,
    value,
    serialization = "raw",
  }: PayloadCodecEncodeOpts<TValue>): SerializedOpaque<unknown> {
    return serialize(serialization, this.toWire(schema, value));
  }

  /** Contains serializer and parser failures so the port can settle the affected operation. */
  public decode<TValue>({
    schema,
    value,
    serialization = "raw",
  }: PayloadCodecDecodeOpts<TValue>): PayloadDecodeResult<TValue> {
    try {
      return {
        success: true,
        data: this.fromWire(schema, deserialize(serialization, value as SerializedOpaque<unknown>)),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
