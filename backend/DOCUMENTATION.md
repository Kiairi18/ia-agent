# Backend Code Documentation
### Dar Chaaben RAG Chatbot — `ingest.js` & `main.js`

---

## Overview

The backend is split into two files with distinct roles:

| File | Role | When to run |
|---|---|---|
| `ingest.js` | Prepares and stores the knowledge base | Once, before starting the server |
| `main.js` | Serves the chat API to the frontend | Always, while the app is in use |

---

## `ingest.js` — Knowledge Base Ingestion

### Purpose
Reads the text file about Dar Chaaben, splits it into small pieces, converts each piece into a vector (a list of numbers that represents meaning), and stores everything in ChromaDB so it can be searched later.

---

### Constants (Configuration)

```js
const OLLAMA_BASE_URL = "http://localhost:11434";
const EMBED_MODEL     = "nomic-embed-text";
const COLLECTION_NAME = "dar_chaaben";
const DATA_FILE       = "../data/dar-chaabben.txt";
const CHUNK_SIZE      = 400;   // characters per chunk
const CHUNK_OVERLAP   = 80;    // overlap between chunks
```

| Constant | Meaning |
|---|---|
| `OLLAMA_BASE_URL` | Address where Ollama is running locally |
| `EMBED_MODEL` | The AI model that converts text → vector numbers |
| `COLLECTION_NAME` | The name of the "folder" inside ChromaDB |
| `DATA_FILE` | Path to the knowledge base text file |
| `CHUNK_SIZE` | Maximum characters per chunk (piece of text) |
| `CHUNK_OVERLAP` | How many characters two consecutive chunks share |

---

### Function 1 — `loadText(filePath)`

```js
function loadText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}
```

**What it does:**
Reads the entire text file from disk and returns it as one big string.

**Parameters:**
- `filePath` → the path to `dar-chaabben.txt`

**Returns:** The full text content as a string.

**Why it checks existence first:** If the file is missing, it throws a clear error instead of a confusing crash.

---

### Function 2 — `chunkText(text, size, overlap)`

```js
function chunkText(text, size = 400, overlap = 80) { ... }
```

**What it does:**
Cuts the long text into many small, overlapping pieces called **chunks**.

**Parameters:**
- `text` → the full text string from the file
- `size` → target character length per chunk (default: 400)
- `overlap` → how many characters from the end of chunk N are repeated at the start of chunk N+1 (default: 80)

**Returns:** An array of strings (the chunks).

**Visual example:**
```
Full text: "...Dar Chaaben is in Tunisia. It has beaches. The economy..."

chunk 1:  "Dar Chaaben is in Tunisia. It has beaches."
chunk 2:  "It has beaches. The economy..."
           ↑ overlaps 15 chars with chunk 1
```

**Why overlap?** So that sentences that fall at the boundary between two chunks are not lost — they appear in both.

**Smart boundary detection:** Instead of cutting exactly at character 400, it looks back up to 60 characters for a `. ` or `\n` and cuts there. This avoids cutting a sentence in the middle.

**Filter at the end:** Drops any chunk shorter than 20 characters (tiny leftover fragments).

---

### Function 3 — `embedText(text)` *(async)*

```js
async function embedText(text) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  return data.embedding; // float[]
}
```

**What it does:**
Sends one chunk of text to Ollama and gets back an **embedding vector** — an array of ~768 decimal numbers that mathematically encodes the *meaning* of the text.

**Parameters:**
- `text` → one chunk of text

**Returns:** An array of numbers, e.g. `[0.023, -0.412, 0.891, ...]`

**Why vectors?** Two texts about similar topics will produce vectors that are numerically close to each other. This is what allows semantic search — finding answers that *mean* the same thing as the question, even with different words.

**Calls:** `POST http://localhost:11434/api/embeddings`

---

### Function 4 — `ingest()` *(async, main pipeline)*

```js
async function ingest() { ... }
```

**What it does:**
The master function that coordinates all the steps. It is called automatically when you run `node ingest.js`.

**Step-by-step execution:**

```
Step 1 → loadText()       : Read dar-chaabben.txt from disk
Step 2 → chunkText()      : Split into 20 overlapping chunks
Step 3 → deleteCollection  : Wipe old data in ChromaDB (fresh start)
Step 4 → createCollection  : Create a new "dar_chaaben" collection
Step 5 → loop embedText()  : Embed each of the 20 chunks one by one
Step 6 → collection.upsert : Save all vectors + text into ChromaDB
```

**Data stored per chunk in ChromaDB:**

| Field | Example value | Purpose |
|---|---|---|
| `id` | `"chunk_3"` | Unique identifier |
| `document` | `"Dar Chaaben has beaches..."` | The original text |
| `embedding` | `[0.02, -0.41, ...]` | The vector for search |
| `metadata` | `{ source: "dar-chaabben.txt", chunkIndex: 3 }` | Extra info |

**ChromaDB settings:** Uses `"hnsw:space": "cosine"` — meaning similarity is measured by the angle between vectors (cosine similarity), which works well for text.

---
---

## `main.js` — Chat API Server

### Purpose
An Express web server that listens for questions from the React frontend, finds the most relevant text chunks from ChromaDB, and streams a real-time answer from llama3.

---

### Constants (Configuration)

```js
const PORT            = 3001;
const OLLAMA_BASE_URL = "http://localhost:11434";
const EMBED_MODEL     = "nomic-embed-text";
const CHAT_MODEL      = "llama3";
const COLLECTION_NAME = "dar_chaaben";
const TOP_K           = 5;
```

| Constant | Meaning |
|---|---|
| `PORT` | The port this server listens on (frontend calls `localhost:3001`) |
| `EMBED_MODEL` | Same model as ingest — must match so vectors are comparable |
| `CHAT_MODEL` | The LLM that generates the final answer |
| `TOP_K` | How many chunks to retrieve from ChromaDB (top 5 most relevant) |

---

### Constant — `SYSTEM_PROMPT`

```js
const SYSTEM_PROMPT = `You are a helpful assistant specialized in Dar Chaaben...
Use ONLY the provided context to answer...
Answer in the same language the user uses (Arabic or English or French).`;
```

**What it does:**
A fixed set of instructions given to llama3 at the start of every prompt. It:
- Tells the AI its role (Dar Chaaben expert)
- Restricts it to only use the retrieved context (no hallucination)
- Instructs it to respond in the user's language

---

### Function 5 — `embedQuery(text)` *(async)*

```js
async function embedQuery(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, { ... });
  return data.embedding;
}
```

**What it does:**
Converts the user's question into a vector number array — the exact same process used in `embedText()` during ingestion.

**Why the same model?** The question and the stored chunks must be embedded using the same model, otherwise their vectors live in different "spaces" and the comparison is meaningless.

**Parameters:**
- `text` → the user's question string

**Returns:** A float array (the question's embedding vector)

---

### Function 6 — `retrieveContext(collection, queryEmbedding)` *(async)*

```js
async function retrieveContext(collection, queryEmbedding) {
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: TOP_K,
    include: ["documents", "metadatas", "distances"],
  });
  return chunks; // array of { text, distance, metadata }
}
```

**What it does:**
Searches ChromaDB using the question's vector to find the `TOP_K` (5) most semantically similar chunks.

**Parameters:**
- `collection` → the open ChromaDB `dar_chaaben` collection
- `queryEmbedding` → the vector of the user's question

**Returns:** Array of objects, each containing:

| Field | Example | Meaning |
|---|---|---|
| `text` | `"Dar Chaaben has beaches..."` | The raw chunk text |
| `distance` | `0.12` | How different from the question (lower = more similar) |
| `metadata` | `{ source: "...", chunkIndex: 3 }` | Where the chunk came from |

**How the math works:**
ChromaDB computes the **cosine distance** between the question vector and every stored chunk vector. The 5 chunks with the smallest distance (most similar meaning) are returned.

---

### Function 7 — `buildPrompt(context, question)`

```js
function buildPrompt(context, question) {
  const contextBlock = context
    .map((c, i) => `[Source ${i + 1}]\n${c.text}`)
    .join("\n\n");

  return `${SYSTEM_PROMPT}\n\n--- CONTEXT ---\n${contextBlock}\n--- END CONTEXT ---\n\nUser question: ${question}\n\nAnswer:`;
}
```

**What it does:**
Assembles the final text prompt that gets sent to llama3, combining three parts:

```
┌─────────────────────────────────────────┐
│  SYSTEM_PROMPT                          │  ← Role + rules for the AI
│                                         │
│  --- CONTEXT ---                        │
│  [Source 1] Dar Chaaben is located...   │  ← Top 5 retrieved chunks
│  [Source 2] The economy is based on...  │
│  --- END CONTEXT ---                    │
│                                         │
│  User question: Where is Dar Chaaben?   │  ← The actual question
│                                         │
│  Answer:                                │  ← LLM fills in from here
└─────────────────────────────────────────┘
```

**Parameters:**
- `context` → the array of chunks from `retrieveContext()`
- `question` → the user's question string

**Returns:** One big string (the complete prompt for llama3)

---

### Function 8 — `sendEvent(type, payload)` *(inline helper inside POST /chat)*

```js
const sendEvent = (type, payload) => {
  res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
};
```

**What it does:**
Sends one **SSE (Server-Sent Event)** message to the frontend. SSE is a protocol that keeps the HTTP connection open and pushes data in real-time.

**The `\n\n` at the end is mandatory** — it signals the end of one SSE event.

**Event types sent during a request:**

| Type | When sent | Payload |
|---|---|---|
| `status` | While working | `{ message: "Searching..." }` |
| `sources` | After ChromaDB search | `{ sources: [{text, score}] }` |
| `token` | For each word from llama3 | `{ token: "Dar " }` |
| `done` | When llama3 finishes | `{ message: "Stream complete" }` |
| `error` | If anything fails | `{ message: "..." }` |

---

### Endpoint — `GET /health`

```js
app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: CHAT_MODEL, embed: EMBED_MODEL });
});
```

**What it does:**
A simple health check. Returns a JSON confirming the server is alive and which models are configured.

**Use it to verify:** `curl http://localhost:3001/health`

---

### Endpoint — `POST /chat` *(the full RAG pipeline)*

```js
app.post("/chat", async (req, res) => { ... });
```

**What it does:**
The main endpoint. Receives a question, runs the entire RAG pipeline, and streams the answer back.

**Input (request body):**
```json
{ "question": "Where is Dar Chaaben?" }
```

**Full execution flow:**

```
1. Validate input          → reject if question is empty
2. Set SSE headers         → keep connection open for streaming
3. embedQuery(question)    → convert question to vector
4. getCollection()         → open ChromaDB dar_chaaben
5. retrieveContext()       → find top 5 matching chunks
6. sendEvent("sources")    → push sources to frontend
7. buildPrompt()           → assemble full LLM prompt
8. fetch ollama /generate  → start streaming llama3
9. read stream loop        → for each token, sendEvent("token")
10. sendEvent("done")      → signal end of stream
11. res.end()              → close the HTTP connection
```

**Error handling:** Wrapped in `try/catch/finally` — any error is streamed as `sendEvent("error", ...)` and the connection is always closed in `finally`.

---

### Server Startup

```js
app.listen(PORT, () => {
  console.log(`✅  Dar Chaaben RAG server running at http://localhost:${PORT}`);
});
```

**What it does:**
Starts the Express server on port **3001** and prints confirmation to the terminal. The server runs until you stop it with `Ctrl+C`.

---

## Complete Data Flow Diagram

```
[React Frontend]
     │  POST /chat  { question: "Where is Dar Chaaben?" }
     ▼
[main.js — Express Server]
     │
     ├─ embedQuery(question)
     │       │  POST /api/embeddings
     │       ▼
     │  [Ollama: nomic-embed-text]
     │       │  returns: [0.02, -0.41, 0.88, ...]
     │       ▼
     ├─ retrieveContext(embedding)
     │       │  query chromadb collection
     │       ▼
     │  [ChromaDB — dar_chaaben collection]
     │       │  returns: top 5 most similar chunks
     │       ▼
     ├─ buildPrompt(chunks, question)
     │       │  assembles: system + context + question
     │       ▼
     ├─ fetch ollama /api/generate  { model: "llama3", stream: true }
     │       ▼
     │  [Ollama: llama3]
     │       │  streams tokens one by one
     │       ▼
     └─ sendEvent("token") × N  →  [React Frontend renders words live]
```
