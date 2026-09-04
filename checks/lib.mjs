// Shared helper for this workshop's checks: runs the student's own program
// with a given prompt (and optional extra env) and returns its
// stdout/stderr/exit code. Every check imports this instead of re-plumbing
// child_process - one place to keep the invocation shape correct.
//
// Runs via `bash your_program.sh` rather than `./your_program.sh` - starter
// files are seeded without the executable bit, so relying on it here would
// make every check flaky regardless of what the student's terminal shows.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Runs `bash your_program.sh -p <prompt>` from the current directory. */
export async function runAgent(prompt, { env = {}, timeoutMs = 25_000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(
      "bash",
      ["your_program.sh", "-p", prompt],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        timeout: timeoutMs,
        maxBuffer: 1 << 20,
      }
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err.message ?? err),
    };
  }
}

export function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

export function pass(message) {
  console.log(`✓ ${message}`);
  process.exit(0);
}
