# Build Your Own CLI Agent - workspace

This is a real Bun + TypeScript project, not a sandbox. Everything you build
here is the actual program the checks run against.

## Files

- `main.ts` - the CLI agent. You fill this in chapter by chapter.
- `tools.json` - the tool specs you advertise to the model. Starts empty.
- `your_program.sh` - run it as `./your_program.sh -p "your prompt"`.
  First time only: `chmod +x your_program.sh`.

## Running it

```sh
./your_program.sh -p "Say hello in 3 words"
```

`LAB_LLM_API_KEY` and `LAB_LLM_BASE_URL` are already set in this container's
environment - no `.env` file needed, `main.ts` reads them straight from
`process.env`. `LAB_LLM_BASE_URL` points at this platform's own proxy, not
the model provider directly - your key is a harmless placeholder that only
works there. See "Talking to an LLM Over HTTP" for why.

## Checks

Each lab's checks run your program for real, with real prompts, against the
live model - the same command you'd run yourself. If a check fails, run that
exact prompt yourself in the terminal and read what came back; the model's
own answer is usually the fastest debugger you have.
