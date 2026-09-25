/**
 * loaders.js
 * ─────────────────────────────────────────────────────────────
 * Document loaders for PDF, Word (.docx), Markdown, JSON, and Text files.
 * ─────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

/**
 * Load and extract text from a single file based on its extension.
 * @param {string} filePath 
 * @returns {Promise<{ text: string, fileName: string, fileType: string }>}
 */
export async function loadDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let text = "";

  switch (ext) {
    case ".txt":
    case ".md":
      text = fs.readFileSync(filePath, "utf-8");
      break;

    case ".pdf": {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      text = data.text;
      break;
    }

    case ".docx": {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
      break;
    }

    case ".json": {
      const raw = fs.readFileSync(filePath, "utf-8");
      try {
        const json = JSON.parse(raw);
        text = typeof json === "string" ? json : JSON.stringify(json, null, 2);
      } catch {
        text = raw;
      }
      break;
    }

    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }

  // Clean up excessive blank lines and whitespace
  const cleanedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: cleanedText,
    fileName,
    fileType: ext.replace(".", "").toUpperCase(),
  };
}

/**
 * Load all supported documents from a directory.
 * @param {string} dirPath 
 * @returns {Promise<Array<{ text: string, fileName: string, fileType: string, filePath: string }>>}
 */
export async function loadAllDocumentsFromDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const supportedExtensions = [".txt", ".pdf", ".docx", ".md", ".json"];
  const files = fs.readdirSync(dirPath);
  const docs = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && supportedExtensions.includes(path.extname(file).toLowerCase())) {
      try {
        const doc = await loadDocument(fullPath);
        if (doc.text.trim().length > 0) {
          docs.push({ ...doc, filePath: fullPath });
        }
      } catch (err) {
        console.warn(`⚠️  Failed to load ${file}:`, err.message);
      }
    }
  }

  return docs;
}
