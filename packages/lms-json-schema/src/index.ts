import { BackendInterface } from "@lmstudio/lms-communication";
import * as backendInterfaceCreators from "@lmstudio/lms-external-backend-interfaces";
import * as sharedTypes from "@lmstudio/lms-shared-types";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { z, ZodSchema, ZodVoid } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

function camelToPascal(camel: string): string {
  return camel[0].toUpperCase() + camel.slice(1);
}

function pascalToCamel(pascal: string): string {
  return pascal[0].toLowerCase() + pascal.slice(1);
}

const schemas = new Map<string, ZodSchema>();

Object.entries(sharedTypes)
  .filter(([key, value]) => {
    if (!key.endsWith("Schema")) {
      return false;
    }
    if (!(value instanceof ZodSchema)) {
      return false;
    }
    return true;
  })
  .forEach(([key, value]) => {
    schemas.set(key.slice(0, -"schema".length), value as ZodSchema);
  });

backendInterfaceCreators.createBaseModelBackendInterface;

const namespacePseudoSchemas = new Map<string, ZodSchema>();

for (const [key, value] of Object.entries(backendInterfaceCreators)) {
  if (typeof value !== "function") {
    continue;
  }
  if (key === "createBaseModelBackendInterface") {
    continue;
  }
  const backendInterface = (value as any)() as BackendInterface;
  if (!(backendInterface instanceof BackendInterface)) {
    continue;
  }
  const match = key.match(/^create(.*)BackendInterface$/);
  if (match === null) {
    continue;
  }
  const namespacePascalName = match[1];
  const namespaceCamelName = pascalToCamel(namespacePascalName);

  const endpointPseudoSchemas = new Map<string, ZodSchema>();

  for (const rpcEndpoint of backendInterface.getAllRpcEndpoints()) {
    if (
      !(rpcEndpoint.parameter instanceof ZodSchema) ||
      !(rpcEndpoint.returns instanceof ZodSchema)
    ) {
      throw new Error(
        `JSON schema generation requires Zod payloads: ${namespaceCamelName}/${rpcEndpoint.name}`,
      );
    }
    const endpointPseudoSchemaFields = new Map<string, ZodSchema>();
    if (!(rpcEndpoint.parameter instanceof ZodVoid)) {
      schemas.set(`${namespaceCamelName}/rpc/${rpcEndpoint.name}/parameter`, rpcEndpoint.parameter);
      endpointPseudoSchemaFields.set("parameter", rpcEndpoint.parameter);
    }
    if (!(rpcEndpoint.returns instanceof ZodVoid)) {
      schemas.set(`${namespaceCamelName}/rpc/${rpcEndpoint.name}/returns`, rpcEndpoint.returns);
      endpointPseudoSchemaFields.set("returns", rpcEndpoint.returns);
    }
    schemas.set(`${namespaceCamelName}/rpc/${rpcEndpoint.name}/returns`, rpcEndpoint.returns);
    const pseudoSchema = z.object(Object.fromEntries(endpointPseudoSchemaFields));
    const endpointPascalName = camelToPascal(rpcEndpoint.name);
    endpointPseudoSchemas.set(`rpc${endpointPascalName}`, pseudoSchema);
    schemas.set(`pseudo/${namespaceCamelName}/rpc/${rpcEndpoint.name}`, pseudoSchema);
  }

  for (const channelEndpoint of backendInterface.getAllChannelEndpoints()) {
    if (
      !(channelEndpoint.creationParameter instanceof ZodSchema) ||
      !(channelEndpoint.toClientPacket instanceof ZodSchema) ||
      !(channelEndpoint.toServerPacket instanceof ZodSchema)
    ) {
      throw new Error(
        `JSON schema generation requires Zod payloads: ${namespaceCamelName}/${channelEndpoint.name}`,
      );
    }
    const endpointPseudoSchemaFields = new Map<string, ZodSchema>();
    if (!(channelEndpoint.creationParameter instanceof ZodVoid)) {
      schemas.set(
        `${namespaceCamelName}/channel/${channelEndpoint.name}/creationParameter`,
        channelEndpoint.creationParameter,
      );
      endpointPseudoSchemaFields.set("creationParameter", channelEndpoint.creationParameter);
    }
    if (!(channelEndpoint.toClientPacket instanceof ZodVoid)) {
      schemas.set(
        `${namespaceCamelName}/channel/${channelEndpoint.name}/toClientPacket`,
        channelEndpoint.toClientPacket,
      );
      endpointPseudoSchemaFields.set("toClientPacket", channelEndpoint.toClientPacket);
    }
    if (!(channelEndpoint.toServerPacket instanceof ZodVoid)) {
      schemas.set(
        `${namespaceCamelName}/channel/${channelEndpoint.name}/toServerPacket`,
        channelEndpoint.toServerPacket,
      );
      endpointPseudoSchemaFields.set("toServerPacket", channelEndpoint.toServerPacket);
    }
    const pseudoSchema = z.object(Object.fromEntries(endpointPseudoSchemaFields));
    const endpointPascalName = camelToPascal(channelEndpoint.name);
    endpointPseudoSchemas.set(`channel${endpointPascalName}`, pseudoSchema);
    schemas.set(`pseudo/${namespaceCamelName}/channel/${channelEndpoint.name}`, pseudoSchema);
  }

  const namespacePseudoSchema = z.object(Object.fromEntries(endpointPseudoSchemas));
  schemas.set(`pseudo/${namespaceCamelName}`, namespacePseudoSchema);
  namespacePseudoSchemas.set(namespaceCamelName, namespacePseudoSchema);
}

const pseudoEntry = z.object(Object.fromEntries(namespacePseudoSchemas));

const jsonSchema = zodToJsonSchema(pseudoEntry, { definitions: Object.fromEntries(schemas) });

const outDir = join(__dirname, "..", "schemas");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "lms.json"), JSON.stringify(jsonSchema, null, 2));
