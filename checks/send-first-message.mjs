// Behavioral checks for 2.2 - Send Your First Message. Each makes ONE real
// call to the model through the student's own program:
//   bun checks/send-first-message.mjs clean
//   bun checks/send-first-message.mjs relevant
import { runAgent, fail, pass } from "./lib.mjs";

const which = process.argv[2];

if (which === "clean") {
  const { code, stdout } = await runAgent("Say hello in exactly 3 words.");
  if (code !== 0)
    fail(`your_program.sh exited ${code} - run it yourself and read the error.`);
  const out = stdout.trim();
  if (!out)
    fail("stdout was empty - did you print response.choices[0].message.content?");
  if (/^\s*[{[]/.test(out) || out.includes('"role"') || out.includes('"choices"'))
    fail("stdout looks like raw JSON - print message.content, not the whole response object.");
  pass(`printed: ${JSON.stringify(out.slice(0, 80))}`);
} else if (which === "relevant") {
  const { code, stdout } = await runAgent(
    "What is 7 plus 5? Reply with only the number, nothing else."
  );
  if (code !== 0) fail(`your_program.sh exited ${code} on a second prompt.`);
  if (!/12/.test(stdout))
    fail(
      `expected the answer to contain "12", got ${JSON.stringify(stdout.trim())} - is the prompt actually reaching the model?`
    );
  pass("a different prompt got a different, correct answer - the API call is real");
} else {
  fail("usage: bun checks/send-first-message.mjs clean|relevant");
}
