/**
 * scrape.js
 * ─────────────────────────────────────────────────────────────
 * Web Page Scraper Tool for Dar Chaaben Knowledge Base.
 * Scrapes clean text content from a web page URL and saves it to data/.
 *
 * Usage:
 *   node scrape.js <URL> [filename]
 *   node scrape.js https://en.wikipedia.org/wiki/Dar_Chaabane
 * ─────────────────────────────────────────────────────────────
 */

import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

export async function scrapeWebPage(url, customFilename) {
  console.log(`🌐 Scraping URL: ${url}...`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DarChaabenScraper/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove noisy elements: scripts, styles, navigation, footers, headers, ads
  $("script, style, nav, footer, header, iframe, noscript, svg, form, .nav, .menu, .footer, .header, .sidebar, .ad, .ads").remove();

  // Extract page title
  const title = $("title").text().trim() || $("h1").first().text().trim() || "Scraped Document";

  // Extract main article/content body text
  let bodyText = "";
  const mainSelector = $("main, article, #content, .content, #main, .main").first();

  if (mainSelector.length > 0) {
    bodyText = mainSelector.text();
  } else {
    bodyText = $("body").text();
  }

  // Clean extra lines and whitespace
  const cleanedText = bodyText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 20) // remove tiny fragment lines
    .join("\n");

  const formattedContent = `SOURCE URL: ${url}\nTITLE: ${title}\nSCRAPED AT: ${new Date().toISOString()}\n\n--- CONTENT ---\n\n${cleanedText}`;

  // Generate output filename
  const slug = customFilename || title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  const fileName = `web_${slug}_${Date.now()}.txt`;
  const filePath = path.join(DATA_DIR, fileName);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, formattedContent, "utf-8");
  console.log(`✅ Scraped successfully! Saved to: data/${fileName}`);
  console.log(`📊 Extracted ~${cleanedText.length} characters of clean text.\n`);

  return { filePath, fileName, title, charCount: cleanedText.length };
}

// ── CLI Runner ────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("scrape.js")) {
  const urlArg = process.argv[2];
  const filenameArg = process.argv[3];

  if (!urlArg) {
    console.error("❌ Error: Please provide a URL to scrape.");
    console.log("Usage: node scrape.js <URL> [custom_filename]");
    console.log("Example: node scrape.js https://en.wikipedia.org/wiki/Dar_Chaabane");
    process.exit(1);
  }

  scrapeWebPage(urlArg, filenameArg)
    .then(() => {
      console.log("💡 Tip: Run 'npm run ingest' to re-index all data files into ChromaDB!");
    })
    .catch((err) => {
      console.error("❌ Scraping failed:", err.message);
      process.exit(1);
    });
}
