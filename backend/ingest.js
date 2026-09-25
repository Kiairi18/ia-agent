/**
 * ingest.js
 * ─────────────────────────────────────────────────────────────
 * Multi-Format Knowledge Base Ingestion Tool.
 * Scans data/ for PDF, Word (.docx), Markdown, JSON, and Text files,
 * chunks their text, embeds each chunk via Ollama (nomic-embed-text),
 * and stores vectors with rich metadata into ChromaDB.
 *
 * Usage:
 *   node ingest.js
 * ─────────────────────────────────────────────────────────────
 */

import { ChromaClient } from "chromadb";
import path from "path";
import { fileURLToPath } from "url";
import { loadAllDocumentsFromDir } from "./loaders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────
const OLLAMA_BASE_URL = "http://localhost:11434";
const EMBED_MODEL = "nomic-embed-text";
const COLLECTION_NAME = "dar_chaaben";
const DATA_DIR = path.join(__dirname, "../data");
const CHUNK_SIZE = 400;   // characters per chunk
const CHUNK_OVERLAP = 80; // overlap between consecutive chunks

// ── Split text into overlapping chunks ─────────────────────────
function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + size;

    if (end < text.length) {
      const breakSearch = text.slice(Math.max(end - 60, start), end);
      const lastBreak = Math.max(
        breakSearch.lastIndexOf(". "),
        breakSearch.lastIndexOf("\n")
      );
      if (lastBreak !== -1) {
        end = Math.max(end - 60, start) + lastBreak + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter((c) => c.length > 20);
}

// ── Embed text chunk via Ollama ───────────────────────────────
async function embedText(text) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama embedding error: ${err}`);
  }

  const data = await response.json();
  return data.embedding;
}

// ── Main Ingestion Pipeline ────────────────────────────────────
async function ingest() {
  console.log("🚀 Starting Multi-Format Ingestion Pipeline...\n");

  // 1. Load all supported documents from data/
  console.log(`📂 Scanning directory: ${DATA_DIR}`);
  const docs = await loadAllDocumentsFromDir(DATA_DIR);

  if (docs.length === 0) {
    console.log("⚠️ No supported documents (.txt, .pdf, .docx, .md, .json) found in data/.");
    return;
  }

  console.log(`📚 Found ${docs.length} document(s) to ingest:\n`);
  docs.forEach((d) => console.log(`   - [${d.fileType}] ${d.fileName} (${d.text.length} chars)`));
  console.log("");

  // 2. Chunk all documents
  let allChunks = [];
  docs.forEach((doc) => {
    const chunks = chunkText(doc.text);
    chunks.forEach((chunk, i) => {
      allChunks.push({
        text: chunk,
        source: doc.fileName,
        fileType: doc.fileType,
        chunkIndex: i,
      });
    });
  });

  console.log(`✂️ Created ${allChunks.length} total chunk(s) across all documents.\n`);

  // 3. Connect to ChromaDB
  const chroma = new ChromaClient({ path: "http://localhost:8000" });

  // Reset collection for clean re-ingest
  try {
    await chroma.deleteCollection({ name: COLLECTION_NAME });
    console.log("🗑️ Deleted existing collection for fresh ingest.\n");
  } catch {
    // Collection did not exist
  }

  const collection = await chroma.createCollection({
    name: COLLECTION_NAME,
    metadata: { "hnsw:space": "cosine" },
  });

  // 4. Generate embeddings and prepare upsert payload
  const ids = [];
  const embeddings = [];
  const documents = [];
  const metadatas = [];

  for (let i = 0; i < allChunks.length; i++) {
    const item = allChunks[i];
    process.stdout.write(`⚙️ Embedding chunk ${i + 1}/${allChunks.length} ([${item.fileType}] ${item.source})...`);
    
    const embedding = await embedText(item.text);
    const id = `chunk_${item.source.replace(/[^a-zA-Z0-9]/g, "_")}_${item.chunkIndex}`;

    ids.push(id);
    embeddings.push(embedding);
    documents.push(item.text);
    metadatas.push({
      source: item.source,
      fileType: item.fileType,
      chunkIndex: item.chunkIndex,
    });
    console.log(" ✅");
  }

  // 5. Upsert into ChromaDB
  await collection.upsert({ ids, embeddings, documents, metadatas });

  console.log(`\n🎉 Ingestion complete! ${allChunks.length} chunks stored in ChromaDB collection "${COLLECTION_NAME}".`);
}

ingest().catch((err) => {
  console.error("❌ Ingestion failed:", err.message);
  process.exit(1);
});
