// Checks for 5.1 - The Write Tool.
//   bun checks/write-tool.mjs creates-file
//   bun checks/write-tool.mjs read-then-write
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { runAgent, fail, pass } from "./lib.mjs";

const which = process.argv[2];

if (which === "creates-file") {
  rmSync("notes.txt", { force: true });
  const { code } = await runAgent(
    "Create a file called notes.txt with exactly this text and nothing else: hello agent"
  );
  if (code !== 0) fail(`your_program.sh exited ${code}.`);
  if (!existsSync("notes.txt"))
    fail("notes.txt was not created - is Write wired into the tool-execution branch?");
  const content = readFileSync("notes.txt", "utf8").trim();
  if (content !== "hello agent")
    fail(`notes.txt contains ${JSON.stringify(content)}, expected exactly "hello agent".`);
  pass("notes.txt was created with the exact requested content");
} else if (which === "read-then-write") {
  const SRC = ".grading-source.txt";
  const DEST = ".grading-copy.txt";
  writeFileSync(SRC, "Copy this exact line verbatim.\n");
  rmSync(DEST, { force: true });
  try {
    const { code } = await runAgent(`Read ${SRC}, then write its exact contents to ${DEST}.`);
    if (code !== 0) fail(`your_program.sh exited ${code}.`);
    if (!existsSync(DEST))
      fail(`${DEST} was never created - did the Read result reach the model before it tried to Write?`);
    const a = readFileSync(SRC, "utf8").trim();
    const b = readFileSync(DEST, "utf8").trim();
    if (a !== b) fail(`the copy doesn't match: source=${JSON.stringify(a)} copy=${JSON.stringify(b)}.`);
    pass("Read then Write in the same run produced an exact copy");
  } finally {
    rmSync(SRC, { force: true });
    rmSync(DEST, { force: true });
  }
} else {
  fail("usage: bun checks/write-tool.mjs creates-file|read-then-write");
}
