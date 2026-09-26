/**
 * main.js
 * ─────────────────────────────────────────────────────────────
 * Express server that powers the Dar Chaaben RAG chatbot.
 *
 * Endpoints:
 *   GET  /health   → health check
 *   POST /chat     → RAG pipeline, streams answer via SSE
 *
 * Start with:
 *   node main.js
 * ─────────────────────────────────────────────────────────────
 */

import express from "express";
import cors from "cors";
import { ChromaClient } from "chromadb";

// ── Configuration ─────────────────────────────────────────────
const PORT = 3001;
const OLLAMA_BASE_URL = "http://localhost:11434";
const EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL = process.env.CHAT_MODEL || "llama3.2";
const COLLECTION_NAME = "dar_chaaben";
const TOP_K = 5; // number of chunks to retrieve

// ── System prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a helpful and knowledgeable assistant specialized in answering questions about Dar Chaaben (دار شعبان الفهري), a coastal town in the Nabeul Governorate in Tunisia.

- You remember conversation history and personal information shared by the user (such as their name, preferences, or past messages).
- For factual questions about Dar Chaaben, use the provided context chunks. Be accurate, friendly, and concise.
- If the user asks a conversational question or refers to past context (e.g. "what is my name?"), use the conversation history to answer accurately.
- Answer in the same language the user uses (Arabic, English, or French).`;

// ── Helpers ───────────────────────────────────────────────────

async function embedQuery(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed error: ${await res.text()}`);
  const data = await res.json();
  return data.embedding;
}

async function retrieveContext(collection, queryEmbedding) {
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: TOP_K,
    include: ["documents", "metadatas", "distances"],
  });

  const chunks = results.documents[0].map((doc, i) => ({
    text: doc,
    distance: results.distances[0][i],
    metadata: results.metadatas[0][i],
  }));

  return chunks;
}

function buildPrompt(context, history = [], question) {
  const contextBlock = context
    .map((c, i) => `[Source ${i + 1}]\n${c.text}`)
    .join("\n\n");

  const historyBlock = (Array.isArray(history) ? history : [])
    .slice(-10) // keep last 10 turns for memory
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");

  let prompt = `${SYSTEM_PROMPT}\n\n--- KNOWLEDGE BASE CONTEXT ---\n${contextBlock}\n--- END CONTEXT ---`;

  if (historyBlock) {
    prompt += `\n\n--- CONVERSATION HISTORY ---\n${historyBlock}\n--- END CONVERSATION HISTORY ---`;
  }

  prompt += `\n\nUser question: ${question}\nAnswer:`;
  return prompt;
}

// ── Express app ───────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// GET /health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: CHAT_MODEL, embed: EMBED_MODEL });
});

// POST /chat  — SSE streaming
app.post("/chat", async (req, res) => {
  const { question, history } = req.body;

  if (!question || typeof question !== "string" || question.trim() === "") {
    return res.status(400).json({ error: "Missing or empty 'question' field." });
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  try {
    // 1. Embed the question
    sendEvent("status", { message: "Searching knowledge base..." });
    const queryEmbedding = await embedQuery(question.trim());

    // 2. Query ChromaDB
    const chroma = new ChromaClient({ path: "http://localhost:8000" });
    const collection = await chroma.getCollection({ name: COLLECTION_NAME });
    const contextChunks = await retrieveContext(collection, queryEmbedding);

    // Send retrieved sources to the frontend
    sendEvent("sources", {
      sources: contextChunks.map((c) => ({
        text: c.text,
        score: (1 - c.distance).toFixed(3),
      })),
    });

    // 3. Build the full prompt including history
    const fullPrompt = buildPrompt(contextChunks, history, question.trim());

    // 4. Stream llama3 response
    sendEvent("status", { message: "Generating answer..." });

    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        prompt: fullPrompt,
        stream: true,
      }),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama generate error: ${await ollamaRes.text()}`);
    }

    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.response) {
            sendEvent("token", { token: json.response });
          }
          if (json.done) {
            sendEvent("done", { message: "Stream complete" });
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch (err) {
    console.error("❌ Chat error:", err.message);
    sendEvent("error", { message: err.message });
  } finally {
    res.end();
  }
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Dar Chaaben RAG server running at http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/chat  { "question": "..." }`);
  console.log(`   GET  http://localhost:${PORT}/health`);
});
