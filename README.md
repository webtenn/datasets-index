# Datasets Index Sync

Fetches published items from all 8 of the Webflow OTS Dataset CMS collections
(Tasks & Verifiers, Code Repos, Book Corpora, Audio Catalog, Pronunciation &
POS Dictionaries, Enterprise Company Data, Image & Video, Other) and writes a
single unified `datasets-index.json` file to the repo, tagged per item with a
`collection` key. This powers the custom JS tab filtering on the Full Data
Catalog page — one fetch, split into 8 tabs client-side.

Replaces the original single-collection version, which only covered the old
pilot "Datasets" collection (`6a903ca68436a42fcd4b8842`, still live for now
but slated for deletion — see the OTS Datasets project's `CLAUDE.md`).

Modeled on the [search-index](https://github.com/webtenn/search-index) repo
used for Appen Resources Search, with two differences:

- No reference-field resolution — none of the 8 collections use Webflow
  multi-reference fields; multi-value columns are `; `-delimited plain text
  instead (see `CLAUDE.md` for why). `sync-datasets-index.js`'s `FIELDS`
  config says, per collection, which fields get split into arrays — this
  differs per collection (it mirrors exactly which columns the Python
  cleaning script ran through `standardize_multivalue()` for that tab).
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

Every item carries the same base fields (`id`, `collection`, `title`, `slug`,
`url`, `featured`, `datasetId`), plus whatever fields that collection's entry
in `FIELDS` (in `sync-datasets-index.js`) maps in — these differ per
collection, since the 8 collections don't share a schema. A multi-value field
comes back as an array; everything else is a plain string.

```json
{
  "lastUpdated": "2026-09-03T15:44:31.818Z",
  "totalItems": 596,
  "items": [
    {
      "id": "6a998785811b8e5d7361bafb",
      "collection": "audio-catalogue",
      "title": "English (United States) conversational smartphone",
      "slug": "use-asr008",
      "url": "/datasets/audio-catalogue/use-asr008",
      "featured": true,
      "datasetId": "USE_ASR008",
      "locale": ["en-US"],
      "country": "United States",
      "languageGroup": "English",
      "audioType": "Conversational Speech",
      "domainContent": "General / not domain-specific (read speech, digits, names, command & control)",
      "volume": "2.53",
      "unitType": "hours",
      "channel": "Mono",
      "sampleRateKhz": ["16"],
      "dataFormat": "wav",
      "recordingDevice": "Mobile phone",
      "recordingCondition": "Low background noise",
      "datasetDescription": "...",
      "source": "Appen Global",
      "yearOfCollection": ["2024"]
    }
  ]
}
```

See `FIELDS` in `sync-datasets-index.js` for the full field list per
collection, and `TAB_CONFIG` in the OTS Datasets project's
`data-catalog-embed.html` for how each of those fields is used as a filter,
table column, or spec-sheet entry.
