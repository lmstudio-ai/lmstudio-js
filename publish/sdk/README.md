<p align="center">
  
  <picture> 
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/lmstudio-ai/lmstudio.js/assets/3611042/dd0b2298-beec-4dfe-9019-7d4dc5427e40">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/lmstudio-ai/lmstudio.js/assets/3611042/70f24e8f-302b-465d-8607-8c3f36cd4934">
    <img alt="lmstudio javascript library logo" src="https://github.com/lmstudio-ai/lmstudio.js/assets/3611042/70f24e8f-302b-465d-8607-8c3f36cd4934" width="290" height="86" style="max-width: 100%;">
  </picture>
  
</p>
<p align="center"><code>Use local LLMs in JS/TS/Node</code></p>
<p align="center"><i>LM Studio Client SDK</i></p>

`lmstudio-js` is LM Studio's official JavaScript/TypeScript client SDK, it allows you to

- Use LLMs to [respond in chats](https://lmstudio.ai/docs/typescript/llm-prediction/chat-completion) or predict [text completions](https://lmstudio.ai/docs/typescript/llm-prediction/completion)
- Define functions as tools, and turn LLMs into [autonomous agents](https://lmstudio.ai/docs/typescript/agent/act) that run completely locally
- [Load](https://lmstudio.ai/docs/typescript/manage-models/loading), [configure](https://lmstudio.ai/docs/typescript/llm-prediction/parameters), and [unload](https://lmstudio.ai/docs/typescript/manage-models/loading) models from memory
- Supports both browser and any Node-compatible environments
- Generate embeddings for text, and more!

> Using python? See [lmstudio-python](https://github.com/lmstudio-ai/lmstudio-python)

## Installation

```bash
npm install @lmstudio/sdk --save
```

## Quick Example

```ts
import { LMStudioClient } from "@lmstudio/sdk";
const client = new LMStudioClient();

const model = await client.llm.model("llama-3.2-1b-instruct");
const result = await model.respond("What is the meaning of life?");

console.info(result.content);
```

For more examples and documentation, visit [lmstudio-js docs](https://lmstudio.ai/docs/typescript).

## Why use `lmstudio-js` over `openai` sdk?

Open AI's SDK is designed to use with Open AI's proprietary models. As such, it is missing many features that are essential for using LLMs in a local environment, such as:

- Managing loading and unloading models from memory
- Configuring load parameters (context length, gpu offload settings, etc.)
- Speculative decoding
- Getting information (such as context length, model size, etc.) about a model
- ... and more

In addition, while `openai` sdk is automatically generated, `lmstudio-js` is designed from ground-up to be clean and easy to use for TypeScript/JavaScript developers.

## Contributing

You can build the project locally by following these steps:

```bash
git clone https://github.com/lmstudio-ai/lmstudio-js.git --recursive
cd lmstudio-js
npm install
npm run build
```

## Community

<p>Discuss all things lmstudio-js in <a href="https://discord.gg/aPQfnNkxGC">#dev-chat</a> in LM Studio's Community Discord server.</p>
<a href="https://discord.gg/aPQfnNkxGC"><img alt="Discord" src="https://img.shields.io/discord/1110598183144399058?logo=discord&style=flat&logoColor=white"></a>
