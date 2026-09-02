/**
 * Webflow Datasets Index Sync Script
 *
 * Fetches all published items from the Datasets CMS collection(s) and writes
 * a unified datasets-index.json file to the repo, used to power the custom
 * JS filtering on the Full Data Catalog page's tabs.
 *
 * Unlike search-index-sync.js, there are no multi-reference fields to
 * resolve here — Product Type, Common Use Cases, Year of Collection, and
 * Sample Rate are semicolon-delimited plain text fields, so they're just
 * split into arrays.
 *
 * Required environment variables:
 *   WEBFLOW_API_TOKEN  — Site API token (CMS read)
 *   WEBFLOW_SITE_ID    — Your Webflow Site ID
 */

const fs = require("fs");
const path = require("path");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const SITE_ID = process.env.WEBFLOW_SITE_ID;
const BASE_URL = "https://api.webflow.com/v2";

// One collection today ("Datasets", working name "Test"). Each future tab
// (Tasks & Verifiers, Code Repos, Book Corpuses, Audio Catalog, Enterprise
// Company Data, Other Sets) gets its own entry here once it exists — they
// don't share a schema, so field handling per collection may need to differ.
const COLLECTION_IDS = {
  datasets: "6a903ca68436a42fcd4b8842",
};

// URL prefix for each collection — maps to the Webflow Collection Page URL pattern
const COLLECTION_URL_PREFIX = {
  datasets: "/datasets",
};

// Fields that are "; "-delimited plain text and should be split into arrays
// for the front-end JS filter to consume (see CLAUDE.md: no multi-reference
// fields on this collection, by design).
const SEMICOLON_FIELDS = [
  "product-type-2",
  "common-use-cases-3",
  "year-of-collection-2",
  "sample-rate-khz",
];

const OUTPUT_PATH = path.join(__dirname, "datasets-index.json");

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const headers = {
  Authorization: `Bearer ${API_TOKEN}`,
  "accept-version": "1.0.0",
};

/**
 * Fetch all live (published) items from a collection, handling pagination.
 * Webflow v2 API returns max 100 items per page.
 */
async function fetchAllItems(collectionId) {
  let items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE_URL}/collections/${collectionId}/items/live?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to fetch collection ${collectionId}: ${res.status} ${error}`);
    }

    const data = await res.json();
    const page = data.items || [];
    items = items.concat(page);

    if (page.length < limit) break;
    offset += limit;
  }

  return items;
}

/**
 * Split a "; "-delimited text field into a trimmed, non-empty array.
 */
function splitSemicolon(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_TOKEN) throw new Error("Missing WEBFLOW_API_TOKEN environment variable");
  if (!SITE_ID) throw new Error("Missing WEBFLOW_SITE_ID environment variable");

  const allItems = [];

  for (const [collectionKey, collectionId] of Object.entries(COLLECTION_IDS)) {
    console.log(`\n📦 Fetching ${collectionKey}...`);
    const items = await fetchAllItems(collectionId);
    console.log(`  ✓ ${items.length} items found`);

    for (const item of items) {
      const f = item.fieldData || {};

      const record = {
        id: item.id,
        collection: collectionKey,
        title: f["name"] || "",
        slug: f["slug"] || "",
        url: `${COLLECTION_URL_PREFIX[collectionKey]}/${f["slug"] || ""}`,
        featured: !!f["featured"],
        datasetId: f["dataset-id"] || "",
        language: f["language-3"] || "",
        country: f["country-2"] || "",
        languageCode: f["language-code"] || "",
        countryCode: f["country-code"] || "",
        productType: splitSemicolon(f["product-type-2"]),
        detailedProductType: f["detailed-product-type"] || "",
        commonUseCases: splitSemicolon(f["common-use-cases-3"]),
        unit: f["unit"] || "",
        recordingDevice: f["recording-device"] || "",
        recordingCondition: f["recording-condition"] || "",
        contributors: f["contributors"] || "",
        utterances: f["utterances"] || "",
        uniqueWords: f["unique-words"] || "",
        sampleRateKhz: splitSemicolon(f["sample-rate-khz"]),
        channels: f["channels"] || "",
        dataFormat: f["data-format"] || "",
        source: f["source"] || "",
        additionalInformation: f["additional-information"] || "",
        yearOfCollection: splitSemicolon(f["year-of-collection-2"]),
      };

      allItems.push(record);
    }
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    totalItems: allItems.length,
    items: allItems,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\n✅ Done! ${allItems.length} total items written to datasets-index.json`);
  console.log(`   Last updated: ${output.lastUpdated}`);
}

main().catch((err) => {
  console.error("❌ Sync failed:", err.message);
  process.exit(1);
});
