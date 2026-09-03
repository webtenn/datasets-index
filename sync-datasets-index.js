/**
 * Webflow Datasets Index Sync Script
 *
 * Fetches all published items from the 8 Webflow OTS Dataset CMS collections
 * (Tasks & Verifiers, Code Repos, Book Corpora, Audio Catalog, Pronunciation
 * & POS Dictionaries, Enterprise Company Data, Image & Video, Other) and
 * writes a unified datasets-index.json file to the repo, used to power the
 * custom JS tab filtering on the Full Data Catalog page.
 *
 * Replaces the original single-collection version (the old "Datasets"
 * pilot collection, 6a903ca68436a42fcd4b8842) now that the full catalog has
 * been split into 8 category-specific collections with genuinely different
 * schemas. That old collection is still live but is being phased out — see
 * the OTS Datasets project's CLAUDE.md.
 *
 * No reference-field resolution needed — every multi-value field on these
 * collections is a "; "-delimited plain Text field (no multi-reference, by
 * design), so multi-value fields are just split into arrays. Which fields
 * are multi-value differs per collection (see FIELDS below) — it mirrors
 * exactly which columns got `standardize_multivalue()` applied in the
 * Python cleaning script (xlsx_clean.py) for that tab.
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

// Collection IDs from collections_config.py (the Python single source of
// truth for these). Update here too if a collection is ever recreated.
const COLLECTION_IDS = {
  "tasks-verifiers": "6a99832ffd732217e660cb32",
  "code-repos": "6a99853e38e229b39cdc3912",
  "book-corpora": "6a99853f17956efcbddbb342",
  "audio-catalogue": "6a99854057206d63ef24ced9",
  "pronunciation-dictionaries": "6a998540c8ebe72e2d9db074",
  "enterprise-company-data": "6a998541040b22801498a16e",
  "image-video-sets": "6a99854273f796e2592576b7",
  "other-sets": "6a998544fd732217e6612308",
};

// All 8 single-dataset Collection Page templates are live (see CLAUDE.md in
// the "Webflow OTS Datasets" project) at /data-catalog/{collection-key}/{slug}.
const COLLECTION_URL_PREFIX = {
  "tasks-verifiers": "/data-catalog/tasks-verifiers",
  "code-repos": "/data-catalog/code-repos",
  "book-corpora": "/data-catalog/book-corpora",
  "audio-catalogue": "/data-catalog/audio-catalogue",
  "pronunciation-dictionaries": "/data-catalog/pronunciation-dictionaries",
  "enterprise-company-data": "/data-catalog/enterprise-company-data",
  "image-video-sets": "/data-catalog/image-video-sets",
  "other-sets": "/data-catalog/other-sets",
};

// Per-collection field maps: Webflow field slug -> { key: json key, multi }.
// `multi: true` means the field is "; "-delimited and gets split into an
// array. This list is the JS mirror of collections_config.py's field_map,
// with the multi/single split taken directly from which columns
// xlsx_clean.py ran through standardize_multivalue() for that tab — not
// guessed from the slug name (a couple of "(s)"-named fields, e.g. Other
// Sets' "Domain / Subject Area", are actually single-value; see CLAUDE.md).
const FIELDS = {
  "tasks-verifiers": {
    "language-s": { key: "languages", multi: false },
    description: { key: "description", multi: false },
    category: { key: "category", multi: false },
    "domain-subject-area": { key: "domainSubjectArea", multi: true },
    "data-coverage-period": { key: "dataCoveragePeriod", multi: false },
    "qty-available": { key: "qtyAvailable", multi: false },
    "source-annotation": { key: "sourceAnnotation", multi: false },
    "known-limitations": { key: "knownLimitations", multi: false },
    "license-type": { key: "licenseType", multi: false },
    "refresh-cadence": { key: "refreshCadence", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: false },
  },
  "code-repos": {
    category: { key: "category", multi: false },
    industry: { key: "industry", multi: false },
    description: { key: "description", multi: false },
    "years-in-business": { key: "yearsInBusiness", multi: false },
    established: { key: "established", multi: false },
    closed: { key: "closed", multi: false },
    employees: { key: "employees", multi: false },
    contributors: { key: "contributors", multi: false },
    "engineer-quality": { key: "engineerQuality", multi: false },
    "development-type": { key: "developmentType", multi: false },
    "primary-language-s": { key: "primaryLanguages", multi: true },
    "total-loc": { key: "totalLoc", multi: false },
    repos: { key: "repos", multi: false },
    prs: { key: "prs", multi: false },
    "avg-loc-pr": { key: "avgLocPerPr", multi: false },
    commits: { key: "commits", multi: false },
    "test-coverage": { key: "testCoverage", multi: false },
    "code-availability": { key: "codeAvailability", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: false },
  },
  "book-corpora": {
    language: { key: "language", multi: false },
    "product-type": { key: "productType", multi: false },
    domains: { key: "domains", multi: true },
    "data-format": { key: "dataFormat", multi: true },
    volume: { key: "volume", multi: false },
    "unit-type": { key: "unitType", multi: false },
    "dataset-description": { key: "datasetDescription", multi: false },
    source: { key: "source", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: false },
  },
  "audio-catalogue": {
    locale: { key: "locale", multi: true },
    country: { key: "country", multi: false },
    "language-group": { key: "languageGroup", multi: false },
    "audio-type": { key: "audioType", multi: false },
    "domain-content": { key: "domainContent", multi: true },
    volume: { key: "volume", multi: false },
    "unit-type": { key: "unitType", multi: false },
    channel: { key: "channel", multi: false },
    "sample-rate-khz": { key: "sampleRateKhz", multi: true },
    "data-format": { key: "dataFormat", multi: false },
    "recording-device": { key: "recordingDevice", multi: false },
    "recording-condition": { key: "recordingCondition", multi: false },
    "dataset-description": { key: "datasetDescription", multi: false },
    source: { key: "source", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: true },
  },
  "pronunciation-dictionaries": {
    locale: { key: "locale", multi: true },
    country: { key: "country", multi: false },
    "language-group": { key: "languageGroup", multi: false },
    category: { key: "category", multi: false },
    volume: { key: "volume", multi: false },
    "unit-type": { key: "unitType", multi: false },
    "data-format": { key: "dataFormat", multi: false },
    "dataset-description": { key: "datasetDescription", multi: false },
    source: { key: "source", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: false },
  },
  "enterprise-company-data": {
    industry: { key: "industry", multi: false },
    "code-base-available": { key: "codeBaseAvailable", multi: false },
    "business-description": { key: "businessDescription", multi: false },
    "operating-period": { key: "operatingPeriod", multi: false },
    "peak-headcount": { key: "peakHeadcount", multi: false },
    headquarters: { key: "headquarters", multi: false },
    "employee-locations": { key: "employeeLocations", multi: false },
    "operating-model": { key: "operatingModel", multi: false },
    "platforms-tools": { key: "platformsTools", multi: true },
    "data-volume-details": { key: "dataVolumeDetails", multi: false },
  },
  "image-video-sets": {
    category: { key: "category", multi: false },
    domain: { key: "domain", multi: true },
    "recording-device": { key: "recordingDevice", multi: false },
    "recording-condition": { key: "recordingCondition", multi: false },
    "resolution-pixel-dimensions": { key: "resolutionPixelDimensions", multi: true },
    volume: { key: "volume", multi: false },
    "unit-type": { key: "unitType", multi: false },
    "generation-source": { key: "generationSource", multi: false },
    annotation: { key: "annotation", multi: true },
    "data-format": { key: "dataFormat", multi: true },
    source: { key: "source", multi: false },
    "dataset-description": { key: "datasetDescription", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: false },
  },
  "other-sets": {
    "language-s": { key: "languages", multi: true },
    category: { key: "category", multi: false },
    "domain-subject-area": { key: "domainSubjectArea", multi: false },
    "data-coverage-period": { key: "dataCoveragePeriod", multi: true },
    "qty-available": { key: "qtyAvailable", multi: false },
    "generation-source": { key: "generationSource", multi: false },
    annotation: { key: "annotation", multi: false },
    "license-type": { key: "licenseType", multi: false },
    "data-format": { key: "dataFormat", multi: true },
    "refresh-cadence": { key: "refreshCadence", multi: false },
    source: { key: "source", multi: false },
    "dataset-description": { key: "datasetDescription", multi: false },
    "year-of-collection": { key: "yearOfCollection", multi: true },
  },
};

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

    const fieldMap = FIELDS[collectionKey];

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
      };

      for (const [wfSlug, { key, multi }] of Object.entries(fieldMap)) {
        record[key] = multi ? splitSemicolon(f[wfSlug]) : (f[wfSlug] || "");
      }

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
