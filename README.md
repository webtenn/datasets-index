# Datasets Index Sync

Fetches published items from the Webflow Datasets CMS collection and writes a
`datasets-index.json` file used to power the custom JS tab filtering on the
Full Data Catalog page.

Modeled on the [search-index](https://github.com/webtenn/search-index) repo
used for Appen Resources Search, with two differences:

- No reference-field resolution — the Datasets collection uses `; `-delimited
  plain text fields instead of Webflow multi-reference (see the OTS Datasets
  project's `CLAUDE.md` for why). `sync-datasets-index.js` just splits those
  into arrays.
- No Webflow webhook / live-sync yet — this starts with just a daily cron
  rebuild and a manual trigger. The webhook piece (like search-index's
  `api/webhook-handler.js`) can be added later, closer to go-live.

---

## Repository Structure

```
/
├── .github/
│   └── workflows/
│       └── sync-datasets-index.yml   # GitHub Actions workflow
├── sync-datasets-index.js            # Main sync script
├── datasets-index.json               # Output file (auto-generated, do not edit)
├── package.json
└── README.md
```

---

## Setup

### 1. GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

| Secret Name | Value |
|---|---|
| `WEBFLOW_API_TOKEN` | Your Webflow site API token (CMS read) |
| `WEBFLOW_SITE_ID` | `656a605609413dfd3feb9d34` |
| `GH_PAT` | GitHub Personal Access Token with `repo` scope (needed to commit the JSON back to the repo) |

### 2. GitHub Personal Access Token (GH_PAT)

The workflow needs permission to commit the updated `datasets-index.json` back to the repo.

1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Generate a new token with **repo** scope
3. Add it as the `GH_PAT` secret above

---

## Running Manually

You can trigger the sync at any time from the GitHub Actions tab:

1. Go to **Actions** → **Sync Datasets Index**
2. Click **Run workflow**

Or locally (requires env vars):

```bash
WEBFLOW_API_TOKEN=your_token WEBFLOW_SITE_ID=656a605609413dfd3feb9d34 node sync-datasets-index.js
```

---

## Schedule

The workflow runs automatically every day at **2:00 AM UTC** as a full rebuild.
There's no webhook yet, so item edits published in Webflow won't show up in
`datasets-index.json` until the next daily run or a manual trigger.

---

## Output Format

```json
{
  "lastUpdated": "2026-09-02T02:00:00Z",
  "totalItems": 363,
  "items": [
    {
      "id": "webflow-item-id",
      "collection": "datasets",
      "title": "English (Australia) scripted telephony",
      "slug": "aus-asr001-a",
      "url": "/datasets/aus-asr001-a",
      "featured": false,
      "datasetId": "AUS_ASR001",
      "language": "English",
      "country": "Australia",
      "languageCode": "en",
      "countryCode": "AU",
      "productType": ["ASR", "Virtual Assistant"],
      "detailedProductType": "...",
      "commonUseCases": ["Chatbot", "IVR"],
      "unit": "...",
      "recordingDevice": "...",
      "recordingCondition": "...",
      "contributors": "500",
      "utterances": "10,000",
      "uniqueWords": "N/A",
      "sampleRateKhz": ["16", "22", "32", "44", "48"],
      "channels": "...",
      "dataFormat": "...",
      "source": "...",
      "additionalInformation": "...",
      "yearOfCollection": ["2022", "2023"]
    }
  ]
}
```
