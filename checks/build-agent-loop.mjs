// Checks for 4.2 - Build the Agent Loop.
//   bun checks/build-agent-loop.mjs multi-step
//   bun checks/build-agent-loop.mjs logged
import { writeFileSync, rmSync } from "node:fs";
import { runAgent, fail, pass } from "./lib.mjs";

const which = process.argv[2];
const FIXTURE = ".grading-report-a.txt";
const MARKER = "PINEAPPLE-7";

if (which === "multi-step") {
  writeFileSync(FIXTURE, `Quarterly status: all systems nominal. Marker: ${MARKER}.\n`);
  try {
    const { code, stdout } = await runAgent(
      `Read the file ${FIXTURE}, then tell me: does it mention the marker ${MARKER}? Answer with just yes or no.`
    );
    if (code !== 0) fail(`your_program.sh exited ${code}.`);
    if (!/\byes\b/i.test(stdout))
      fail(
        `expected a "yes" after reading the file, got ${JSON.stringify(stdout.trim())} - this needs a Read turn AND a follow-up turn that answers using the tool result.`
      );
    pass("resolved a Read-then-answer prompt across multiple model turns");
  } finally {
    rmSync(FIXTURE, { force: true });
  }
} else if (which === "logged") {
  writeFileSync(FIXTURE, `Quarterly status: all systems nominal. Marker: ${MARKER}.\n`);
  try {
    const { code, stderr } = await runAgent(
      `Read the file ${FIXTURE} and summarize it in one word.`,
      { env: { DEBUG_MESSAGES: "1" } }
    );
    if (code !== 0) fail(`your_program.sh exited ${code} with DEBUG_MESSAGES=1 set.`);
    if (!stderr.includes('"role":"assistant"') || !stderr.includes('"tool_calls"'))
      fail(
        "no assistant message with tool_calls found in the DEBUG_MESSAGES dump - push response.choices[0].message onto messages BEFORE executing its tool calls."
      );
    pass("the assistant's own tool-call message is present in the pushed history");
  } finally {
    rmSync(FIXTURE, { force: true });
  }
} else {
  fail("usage: bun checks/build-agent-loop.mjs multi-step|logged");
}
