import OpenAI from "openai";
import tools from "./tools.json";

const apiKey = process.env.LAB_LLM_API_KEY;
const baseURL = process.env.LAB_LLM_BASE_URL;

if (!apiKey) {
  throw new Error("LAB_LLM_API_KEY is not set");
}
if (!baseURL) {
  throw new Error("LAB_LLM_BASE_URL is not set");
}

const client = new OpenAI({ apiKey, baseURL });

// Local implementation of tools the model can call.
function get_time() {
  return new Date().toLocaleTimeString();
}

const toolImplementations: Record<string, (...args: any[]) => any> = {
  get_time,
};

async function createChatCompletion(messages: any[]) {
  const response = await client.chat.completions.create({
    model: "kimi-k2.5",
    messages,
    tools,
  });

  return response;
}

async function main() {
  const [, , flag, prompt] = process.argv;

  if (flag !== "-p" || !prompt) {
    throw new Error('usage: your_program.sh -p "<prompt>"');
  }

  const messages: any[] = [{ role: "user", content: prompt }];

  let response = await createChatCompletion(messages);
  let message = response.choices[0].message;

  while (message.tool_calls && message.tool_calls.length > 0) {
    messages.push(message);

    for (const call of message.tool_calls) {
      const args = call.function.arguments
        ? JSON.parse(call.function.arguments)
        : {};

      const impl = toolImplementations[call.function.name];
      const result = impl ? impl(args) : `Error: unknown tool "${call.function.name}"`;

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: String(result),
      });
    }

    response = await createChatCompletion(messages);
    message = response.choices[0].message;
  }

  process.stdout.write(message.content ?? "");
}

main();