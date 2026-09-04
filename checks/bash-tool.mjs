// Checks for 5.2 - The Bash Tool.
//   bun checks/bash-tool.mjs runs-in-cwd
//   bun checks/bash-tool.mjs failure-safe
//   bun checks/bash-tool.mjs targeted-delete
import { writeFileSync, existsSync, rmSync } from "node:fs";
import { runAgent, fail, pass } from "./lib.mjs";

const which = process.argv[2];

if (which === "runs-in-cwd") {
  rmSync("bash-marker.txt", { force: true });
  const { code } = await runAgent(
    "Use a shell command to create an empty file called bash-marker.txt in the current directory."
  );
  if (code !== 0) fail(`your_program.sh exited ${code}.`);
  if (!existsSync("bash-marker.txt"))
    fail("bash-marker.txt wasn't found in the project directory - is exeCommand's cwd the workspace, not a temp dir?");
  rmSync("bash-marker.txt", { force: true });
  pass("the Bash tool ran in the program's own working directory");
} else if (which === "failure-safe") {
  const { code, stdout } = await runAgent(
    "Use a shell command to delete a file called this-file-does-not-exist.txt"
  );
  if (code !== 0)
    fail(`your_program.sh exited ${code} instead of reporting the failed command back to the model.`);
  if (!stdout.trim())
    fail("stdout was empty - the model should still give a final answer after the failing command.");
  pass("a failing command was reported back to the model instead of crashing the program");
} else if (which === "targeted-delete") {
  writeFileSync("old-readme.txt", "stale docs\n");
  writeFileSync("keep.txt", "do not delete me\n");
  try {
    const { code } = await runAgent("Delete the old readme file.");
    if (code !== 0) fail(`your_program.sh exited ${code}.`);
    if (existsSync("old-readme.txt")) fail("old-readme.txt is still there - the delete never happened.");
    if (!existsSync("keep.txt")) fail("keep.txt got deleted too - the command was too broad (e.g. a wildcard rm).");
    pass("only the intended file was deleted");
  } finally {
    rmSync("old-readme.txt", { force: true });
    rmSync("keep.txt", { force: true });
  }
} else {
  fail("usage: bun checks/bash-tool.mjs runs-in-cwd|failure-safe|targeted-delete");
}
