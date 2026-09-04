// Checks for 3.2 - Advertise the Read Tool.
//   bun checks/advertise-read-tool.mjs schema   (static, no API call)
//   bun checks/advertise-read-tool.mjs count    (1 real call)
import { readFileSync } from "node:fs";
import { runAgent, fail, pass } from "./lib.mjs";

const which = process.argv[2];

if (which === "schema") {
  let tools;
  try {
    tools = JSON.parse(readFileSync("tools.json", "utf8"));
  } catch (err) {
    fail(`tools.json isn't valid JSON: ${err.message}`);
  }
  if (!Array.isArray(tools) || tools.length === 0)
    fail("tools.json should be an array with at least one tool spec in it.");
  const hasReadSchema = tools.some((t) => {
    const params = t?.function?.parameters;
    return (
      t?.type === "function" &&
      typeof t.function?.name === "string" &&
      params?.type === "object" &&
      params?.properties?.file_path?.type === "string" &&
      Array.isArray(params.required) &&
      params.required.includes("file_path")
    );
  });
  if (!hasReadSchema)
    fail("no tool in tools.json has a valid file_path string parameter marked required.");
  pass("tools.json has a well-formed tool spec with a required file_path parameter");
} else if (which === "count") {
  const { code, stdout } = await runAgent(
    "How many tools are available to you? Reply with only the number."
  );
  if (code !== 0) fail(`your_program.sh exited ${code}.`);
  if (!/\b1\b/.test(stdout))
    fail(
      `expected the model to say it has 1 tool, got ${JSON.stringify(stdout.trim())} - is the tools array actually attached to the request?`
    );
  pass("the model sees exactly one advertised tool");
} else {
  fail("usage: bun checks/advertise-read-tool.mjs schema|count");
}
