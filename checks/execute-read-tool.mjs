// Checks for 3.3 - Execute the Read Tool.
//   bun checks/execute-read-tool.mjs reads-file
//   bun checks/execute-read-tool.mjs plain-text
import { writeFileSync, rmSync } from "node:fs";
import { runAgent, fail, pass } from "./lib.mjs";

const which = process.argv[2];
const FIXTURE = ".grading-secret-note.txt";
const SENTINEL = "4471-BLUE-FALCON";

if (which === "reads-file") {
  writeFileSync(FIXTURE, `The vault code is ${SENTINEL}. Do not share it.\n`);
  try {
    const { code, stdout } = await runAgent(
      `Read the file ${FIXTURE} and print ONLY its exact raw contents - no commentary, no quotes, no code fences.`
    );
    if (code !== 0) fail(`your_program.sh exited ${code}.`);
    if (!stdout.includes(SENTINEL))
      fail(
        `stdout didn't contain the file's contents (got ${JSON.stringify(stdout.trim().slice(0, 120))}) - did you print the tool result's raw content?`
      );
    pass("stdout contains the file's exact contents");
  } finally {
    rmSync(FIXTURE, { force: true });
  }
} else if (which === "plain-text") {
  const { code, stdout } = await runAgent("Say the word banana and nothing else.");
  if (code !== 0)
    fail(`your_program.sh exited ${code} on a prompt with no file involved.`);
  if (!/banana/i.test(stdout))
    fail(
      `expected "banana" in the output, got ${JSON.stringify(stdout.trim())} - adding tool-call handling broke the plain-text fallback from 2.2.`
    );
  pass("plain-text responses (no tool call) still work");
} else {
  fail("usage: bun checks/execute-read-tool.mjs reads-file|plain-text");
}
