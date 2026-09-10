/* Full Data Catalog page logic -- www.appen.com/data-catalog
   Extracted from data-catalog-embed.html 2026-09-10 (the embed was 49,613 of
   Webflow's 50,000-char limit). Styles are a separate style.css <link> in the head.
   LOAD ORDER IS LOAD-BEARING: quote-cart.js, then catalog-search.js, then this file.
   Plain <script src> tags block and execute in document order, and this file needs
   AppenQuoteCart + window.AppenCatalogSearch to already exist. The tags sit AFTER
   #appen-catalog in the embed, so the mount points are parsed before this runs.
   Purge on every change: https://purge.jsdelivr.net/gh/webtenn/datasets-index@main/catalog-page.js */

(function () {

  // jsdelivr mirror; ?t= is an HOURLY bucket, not Date.now() -- see CLAUDE.md. Purge on rebuild.
  var RAW_INDEX_URL = 'https://cdn.jsdelivr.net/gh/webtenn/datasets-index@main/datasets-index.json';

  var PER_PAGE = 20;

  // The 8 new per-category collections (see CLAUDE.md's "Current effort").
  // All items for all 8 live in one datasets-index.json, tagged per item
  // with `collection` — this embed fetches it once and splits client-side.
  var TABS = [
    { key: 'tasks-verifiers',              label: 'Tasks & Verifiers' },
    { key: 'code-repos',                   label: 'Code Repos' },
    { key: 'book-corpora',                 label: 'Book Corpora' },
    { key: 'audio-catalogue',              label: 'Audio Catalog' },
    { key: 'pronunciation-dictionaries',   label: 'Pronunciation & POS Dictionaries' },
    { key: 'enterprise-company-data',      label: 'Enterprise Company Data' },
    { key: 'image-video-sets',             label: 'Image & Video' },
    { key: 'other-sets',                   label: 'Other' }
  ];

  // Per-tab filter + table + detail config. None of these 8 collections
  // share a schema (see collections_config.py), so each gets its own
  // block. `multi: true` on a filter/column means the underlying field is
  // an array (a "; "-delimited Webflow field split by the sync script) —
  // this must match FIELDS in sync-datasets-index.js exactly, since that's
  // what actually decided whether the field was split into an array.
  //
  // `columns` render in the main table (in order, after the Name column).
  // One column per tab may carry `hero: true` — that field's full value
  // list is also shown at the top of the expanded detail panel (mirrors
  // how the old single-collection tab promoted "Common Use Cases").
  // `specFields` render in the detail panel's spec-sheet grid.
  // `descriptionKey`, if set, is shown as prose above the spec grid (never
  // split into a list — these are prose fields, not tag lists; see
  // CLAUDE.md's "Dataset Description columns are prose" note).
  var TAB_CONFIG = {
    'tasks-verifiers': {
      description: 'Human-verified task and LLM verifier datasets across domains, ready to license today.',
      filters: [
        { key: 'category',           label: 'Category',              multi: false },
        { key: 'domainSubjectArea',  label: 'Domain / Subject Area', multi: true  }
      ],
      columns: [
        { key: 'category',          label: 'Category',              multi: false },
        { key: 'domainSubjectArea', label: 'Domain / Subject Area', multi: true, hero: true },
        { key: 'languages',         label: 'Language(s)',           multi: false },
        { key: 'qtyAvailable',      label: 'Qty Available',         multi: false, size: true }
      ],
      descriptionKey: 'description',
      specFields: [
        { key: 'dataCoveragePeriod', label: 'Data Coverage Period' },
        { key: 'sourceAnnotation',   label: 'Source & Annotation' },
        { key: 'knownLimitations',   label: 'Known Limitations' },
        { key: 'licenseType',        label: 'License Type' },
        { key: 'refreshCadence',     label: 'Refresh Cadence' },
        { key: 'yearOfCollection',   label: 'Year of Collection' }
      ]
    },
    'code-repos': {
      description: 'Private and public code repositories with contributor, language, and quality metadata.',
      filters: [
        { key: 'category',         label: 'Category',         multi: false },
        { key: 'industry',         label: 'Industry',         multi: false },
        { key: 'primaryLanguages', label: 'Primary Language', multi: true  }
      ],
      columns: [
        { key: 'category',         label: 'Category',           multi: false },
        { key: 'industry',         label: 'Industry',            multi: false },
        { key: 'primaryLanguages', label: 'Primary Language(s)', multi: true, hero: true },
        { key: 'employees',        label: '# Employees',         multi: false, size: true }
      ],
      descriptionKey: 'description',
      specFields: [
        { key: 'yearsInBusiness',  label: 'Years in Business' },
        { key: 'established',      label: 'Established' },
        { key: 'closed',           label: 'Closed' },
        { key: 'contributors',     label: '# Contributors' },
        { key: 'engineerQuality',  label: 'Engineer Quality' },
        { key: 'developmentType',  label: 'Development Type' },
        { key: 'totalLoc',         label: 'Total LoC' },
        { key: 'repos',            label: '# Repos' },
        { key: 'prs',              label: '# PRs' },
        { key: 'avgLocPerPr',      label: 'Avg LoC / PR' },
        { key: 'commits',          label: '# Commits' },
        { key: 'testCoverage',     label: 'Test Coverage %' },
        { key: 'codeAvailability', label: 'Code Availability' },
        { key: 'yearOfCollection', label: 'Year of Collection' }
      ]
    },
    'book-corpora': {
      description: 'Full-text academic journals and research reference texts, primarily STEM domains.',
      filters: [
        { key: 'domains', label: 'Domains', multi: true }
      ],
      columns: [
        { key: 'language',   label: 'Language',     multi: false },
        { key: 'productType', label: 'Product Type', multi: false },
        { key: 'domains',    label: 'Domains',       multi: true, hero: true },
        { key: 'volume',     label: 'Volume',        multi: false, size: true }
      ],
      descriptionKey: 'datasetDescription',
      specFields: [
        { key: 'dataFormat',       label: 'Data Format' },
        { key: 'unitType',         label: 'Unit (type)' },
        { key: 'source',           label: 'Source' },
        { key: 'yearOfCollection', label: 'Year of Collection' }
      ]
    },
    'audio-catalogue': {
      description: 'Recorded and transcribed speech audio across locales, domains, and recording conditions.',
      filters: [
        { key: 'locale',        label: 'Locale',           multi: true  },
        { key: 'country',       label: 'Country',          multi: false },
        { key: 'languageGroup', label: 'Language Group',   multi: false },
        { key: 'domainContent', label: 'Domain / Content', multi: true  }
      ],
      columns: [
        { key: 'locale',        label: 'Locale',           multi: true, hero: true },
        { key: 'country',       label: 'Country',          multi: false },
        { key: 'languageGroup', label: 'Language Group',   multi: false },
        { key: 'domainContent', label: 'Domain / Content', multi: true },
        { key: 'volume',        label: 'Volume',           multi: false, size: true }
      ],
      descriptionKey: 'datasetDescription',
      specFields: [
        { key: 'domainContent',       label: 'Domain / Content' },
        { key: 'audioType',           label: 'Audio Type' },
        { key: 'unitType',            label: 'Unit (type)' },
        { key: 'channel',             label: 'Channel' },
        { key: 'sampleRateKhz',       label: 'Sample Rate (kHz)' },
        { key: 'dataFormat',          label: 'Data Format' },
        { key: 'recordingDevice',     label: 'Recording Device' },
        { key: 'recordingCondition',  label: 'Recording Condition' },
        { key: 'source',              label: 'Source' },
        { key: 'yearOfCollection',    label: 'Year of Collection' }
      ]
    },
    'pronunciation-dictionaries': {
      description: 'Pronunciation, part-of-speech, and related linguistic dictionaries by locale and language.',
      filters: [
        { key: 'locale',        label: 'Locale',         multi: true  },
        { key: 'country',       label: 'Country',        multi: false },
        { key: 'languageGroup', label: 'Language Group', multi: false },
        { key: 'category',      label: 'Category',       multi: false }
      ],
      columns: [
        { key: 'locale',        label: 'Locale',         multi: true, hero: true },
        { key: 'country',       label: 'Country',        multi: false },
        { key: 'languageGroup', label: 'Language Group', multi: false },
        { key: 'category',      label: 'Category',       multi: false },
        { key: 'volume',        label: 'Volume',         multi: false, size: true }
      ],
      descriptionKey: 'datasetDescription',
      specFields: [
        { key: 'unitType',         label: 'Unit (type)' },
        { key: 'dataFormat',       label: 'Data Format' },
        { key: 'source',           label: 'Source' },
        { key: 'yearOfCollection', label: 'Year of Collection' }
      ]
    },
    'enterprise-company-data': {
      description: 'Internal company operating, workforce, and tooling data across industries.',
      filters: [
        { key: 'industry',       label: 'Industry',         multi: false },
        { key: 'platformsTools', label: 'Platform / Tools', multi: true  }
      ],
      columns: [
        { key: 'industry',       label: 'Industry',          multi: false },
        { key: 'platformsTools', label: 'Platforms / Tools',  multi: true, hero: true },
        { key: 'headquarters',   label: 'Headquarters',       multi: false },
        { key: 'peakHeadcount',  label: 'Peak Headcount',     multi: false, size: true }
      ],
      descriptionKey: 'businessDescription',
      specFields: [
        { key: 'codeBaseAvailable', label: 'Code Base Available' },
        { key: 'operatingPeriod',   label: 'Operating Period' },
        { key: 'employeeLocations', label: 'Employee Locations' },
        { key: 'operatingModel',    label: 'Operating Model' },
        { key: 'dataVolumeDetails', label: 'Data Volume Details' }
      ]
    },
    'image-video-sets': {
      description: 'Annotated image and video datasets across recognition, detection, and OCR use cases.',
      filters: [
        { key: 'category', label: 'Category', multi: false },
        { key: 'domain',   label: 'Domain',    multi: true  }
      ],
      columns: [
        { key: 'category',   label: 'Category',    multi: false },
        { key: 'domain',     label: 'Domain',       multi: true },
        { key: 'dataFormat', label: 'Data Format',  multi: true, hero: true },
        { key: 'volume',     label: 'Volume',       multi: false, size: true }
      ],
      descriptionKey: 'datasetDescription',
      specFields: [
        { key: 'domain',                     label: 'Domain' },
        { key: 'recordingDevice',            label: 'Recording Device' },
        { key: 'recordingCondition',         label: 'Recording Condition' },
        { key: 'resolutionPixelDimensions',  label: 'Resolution / Pixel Dimensions' },
        { key: 'unitType',                    label: 'Unit (type)' },
        { key: 'generationSource',           label: 'Generation Source' },
        { key: 'annotation',                  label: 'Annotation' },
        { key: 'source',                      label: 'Source' },
        { key: 'yearOfCollection',            label: 'Year of Collection' }
      ]
    },
    'other-sets': {
      description: 'Specialized datasets that don’t fit the other seven categories — CAD, clinical text, LLM training data, and more.',
      filters: [
        { key: 'category', label: 'Category', multi: false }
      ],
      columns: [
        { key: 'category',          label: 'Category',              multi: false },
        { key: 'domainSubjectArea', label: 'Domain / Subject Area', multi: false },
        { key: 'dataFormat',        label: 'Data Format',           multi: true, hero: true },
        { key: 'qtyAvailable',      label: 'Qty Available',         multi: false, size: true }
      ],
      descriptionKey: 'datasetDescription',
      specFields: [
        { key: 'languages',          label: 'Language(s)' },
        { key: 'dataCoveragePeriod', label: 'Data Coverage Period' },
        { key: 'generationSource',   label: 'Generation Source' },
        { key: 'annotation',         label: 'Annotation' },
        { key: 'licenseType',        label: 'License Type' },
        { key: 'refreshCadence',     label: 'Refresh Cadence' },
        { key: 'source',             label: 'Source' },
        { key: 'yearOfCollection',   label: 'Year of Collection' }
      ]
    }
  };

  var tabsEl  = document.getElementById('dc-tabs');
  var panelEl = document.getElementById('dc-panel');

  // Pre-select a tab, checked in order:
  //   1. window.DATA_CATALOG_TAB, an explicit manual override (mirrors the
  //      Appen Resources Search project's window.RESOURCE_FILTER pattern).
  //      Kept mainly for the main Data Catalog page / one-off cases; NOT
  //      relied on for the 8 placeholder sub-pages below, because once this
  //      embed is placed via a Webflow Component, a page's own
  //      "Before </body> tag" custom code (the only place left to set a
  //      per-page window var) always renders after all body content --
  //      including the component -- so it would execute too late to be
  //      read here.
  //   2. The URL path itself: each sub-page's slug already IS the
  //      collection key (e.g. /data-catalog/tasks-verifiers/), so the
  //      component needs zero per-page configuration -- just drop it on
  //      the page.
  //   3. TABS[0], if neither of the above match a real collection key.
  function getPathTabKey() {
    var segments = window.location.pathname.split('/').filter(function (s) { return s.length > 0; });
    var last = segments[segments.length - 1];
    return TABS.some(function (t) { return t.key === last; }) ? last : null;
  }
  var activeTab = TABS.some(function (t) { return t.key === window.DATA_CATALOG_TAB; })
    ? window.DATA_CATALOG_TAB
    : (getPathTabKey() || TABS[0].key);
  var indexPromise = null;  // single fetch of the unified index, shared by all tabs
  var byTab = null;         // tab key -> items array, populated once the index loads
  var state = {             // per-tab UI state
    activeFilters: {},
    currentPage: 1
  };

  // catalog-search.js (loaded above) publishes window.AppenCatalogSearch but
  // renders nothing until init() at the bottom hands it what it needs. If
  // that CDN script fails to load, this no-op shim keeps every call site
  // below unconditional -- the catalog works as before, minus search.
  // ALL_KEY '\0' can't match a real tab key, so All can't fire by accident.
  var AS = window.AppenCatalogSearch || {
    matches: function () { return true; }, countFor: function () { return 0; },
    isActive: function () { return false; }, init: function () {},
    renderAll: function () {}, ALL_KEY: '\0',
    emptyHtml: function () { return '<div class="dc-empty"><h3>No datasets match these filters</h3><p>Try clearing a filter or two.</p></div>'; }
  };

  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function uniqueSorted(values) {
    var seen = {}, out = [];
    values.forEach(function (v) {
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }

  // ==================================================================
  // ---- Tabs ----------------------------------------------------------

  function renderTabs(scrollActive) {
    var searching = AS.isActive();
    // While a query is active an "All results" tab is prepended. Its number
    // slot reads '--', not 00/09: with a count on every tab, a numbered
    // ninth entry reads as a ninth collection rather than a mode.
    var list = searching ? [{ key: AS.ALL_KEY, label: 'All results' }].concat(TABS) : TABS;

    tabsEl.innerHTML = list.map(function (t, idx) {
      var isAll = t.key === AS.ALL_KEY;
      var num = isAll ? '--' : ('0' + (searching ? idx : idx + 1)).slice(-2);
      var n = searching ? AS.countFor(t.key) : 0;
      var cls = 'dc-tab' + (t.key === activeTab ? ' active' : '') +
        (isAll ? ' dc-tab-all' : '') + (searching && !n ? ' dc-tab-zero' : '');
      return '<button type="button" class="' + cls + '" data-tab="' + t.key + '">' +
        '<span class="dc-tab-num">' + num + '</span>' + escHtml(t.label) +
        (searching ? '<span class="dc-tab-n">' + n + '</span>' : '') + '</button>';
    }).join('');

    tabsEl.querySelectorAll('.dc-tab[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.tab === activeTab) return;
        activeTab = btn.dataset.tab;
        state.currentPage = 1;
        renderTabs(true);
        renderPanel();
      });
    });

    // The tab bar scrolls horizontally on narrow viewports (see .dc-tabs'
    // overflow-x: auto) with its scrollbar hidden, so a tab near either
    // edge -- e.g. "08 Other" -- can be easy to miss. Centering the newly
    // active tab nudges the strip toward whichever edge was clicked,
    // revealing a bit of whatever comes next on both sides.
    // Only on a real tab click. renderTabs() also re-runs on every debounced
    // search keystroke, and a smooth scroll firing under the user's cursor as
    // they type -- scrollIntoView walks scrollable ancestors, so it can nudge
    // the page too -- reads as a glitch.
    if (!scrollActive) return;
    var activeBtn = tabsEl.querySelector('.dc-tab.active');
    if (activeBtn && activeBtn.scrollIntoView) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  // ---- Panel (per active tab) ----------------------------------------

  function renderPanel() {
    // The All-results view is owned by catalog-search.js -- it spans all 8
    // schemas, so there is no single cfg to render a table from.
    if (activeTab === AS.ALL_KEY) { AS.renderAll(); return; }

    var tab = TABS.filter(function (t) { return t.key === activeTab; })[0];

    if (!state.activeFilters[activeTab]) state.activeFilters[activeTab] = {};

    panelEl.innerHTML = '<div class="dc-loading"><div class="dc-spinner"></div><p>Loading ' + escHtml(tab.label).toLowerCase() + '&hellip;</p></div>';

    loadTabItems(tab.key).then(function (items) {
      if (activeTab !== tab.key) return; // user switched tabs while this was loading
      renderLoadedPanel(tab, items);
    }).catch(function () {
      if (activeTab !== tab.key) return;
      panelEl.innerHTML = '<div class="dc-empty"><h3>Couldn&rsquo;t load this catalog</h3><p>Please try refreshing the page.</p></div>';
    });
  }

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(RAW_INDEX_URL + '?t=' + Math.floor(Date.now() / 36e5))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          byTab = {};
          TABS.forEach(function (t) { byTab[t.key] = []; });
          (data.items || []).forEach(function (item) {
            if (byTab[item.collection]) byTab[item.collection].push(item);
          });
          Object.keys(byTab).forEach(function (key) {
            byTab[key].sort(function (a, b) {
              if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
              return (a.title || '').localeCompare(b.title || '');
            });
          });
          return byTab;
        });
    }
    return indexPromise;
  }

  function loadTabItems(tabKey) {
    return loadIndex().then(function (grouped) { return grouped[tabKey] || []; });
  }

  function renderLoadedPanel(tab, items) {
    var cfg = TAB_CONFIG[tab.key];
    var tabIdx = TABS.map(function (t) { return t.key; }).indexOf(tab.key);
    var countLabel = ('0' + (tabIdx + 1)).slice(-2) + '&nbsp;/&nbsp;' + ('0' + TABS.length).slice(-2);

    panelEl.innerHTML =
      '<div class="dc-panel-head"><span class="dc-panel-count">' + countLabel + '</span><span class="dc-panel-title">' + escHtml(tab.label) + '</span></div>' +
      '<p class="dc-panel-desc">' + escHtml(cfg.description) + '</p>' +
      '<div class="dc-filterbar" id="dc-filterbar"></div>' +
      '<div class="dc-results-row"><span id="dc-results-count"></span></div>' +
      '<div class="dc-table-wrap"><div class="dc-table-scroll">' +
        '<table class="dc-table"><thead><tr>' +
          '<th class="dc-col-actions"></th>' +
          '<th>Dataset Name</th>' +
          cfg.columns.map(function (c) { return '<th>' + escHtml(c.label) + '</th>'; }).join('') +
        '</tr></thead><tbody id="dc-tbody"></tbody></table>' +
      '</div></div>' +
      '<div class="dc-pagination" id="dc-pagination"></div>';

    buildFilterBar(cfg, items);
    applyAndRender(cfg, items);
  }

  // ---- Filters ---------------------------------------------------------

  function fieldValues(items, key, multi) {
    var vals = [];
    items.forEach(function (item) {
      if (multi) { vals = vals.concat(item[key] || []); }
      else if (item[key]) { vals.push(item[key]); }
    });
    return uniqueSorted(vals);
  }

  function buildFilterBar(cfg, items) {
    var bar = document.getElementById('dc-filterbar');
    var filters = state.activeFilters[activeTab];

    var soloClass = cfg.filters.length === 1 ? ' dc-filter-field-solo' : '';

    bar.innerHTML = cfg.filters.map(function (f) {
      var options = fieldValues(items, f.key, f.multi);
      var current = filters[f.key] || '';
      return '<div class="dc-filter-field' + soloClass + '">' +
        '<label class="dc-filter-label" for="dc-filter-' + f.key + '">' + escHtml(f.label) + '</label>' +
        '<select class="dc-select" id="dc-filter-' + f.key + '" data-key="' + f.key + '">' +
          '<option value="">All</option>' +
          options.map(function (v) {
            return '<option value="' + escHtml(v) + '"' + (v === current ? ' selected' : '') + '>' + escHtml(v) + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
    }).join('') + '<button type="button" class="dc-clear-btn" id="dc-clear-filters">Clear filters</button>';

    bar.querySelectorAll('select[data-key]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var key = sel.dataset.key;
        if (sel.value) { filters[key] = sel.value; } else { delete filters[key]; }
        state.currentPage = 1;
        applyAndRender(cfg, items);
      });
    });

    document.getElementById('dc-clear-filters').addEventListener('click', function () {
      state.activeFilters[activeTab] = {};
      state.currentPage = 1;
      buildFilterBar(cfg, items);
      applyAndRender(cfg, items);
    });
  }

  function matchesFilters(item, cfg, filters) {
    return cfg.filters.every(function (f) {
      var want = filters[f.key];
      if (!want) return true;
      if (f.multi) return (item[f.key] || []).indexOf(want) !== -1;
      return item[f.key] === want;
    });
  }

  // ---- Table + pagination ----------------------------------------------

  function applyAndRender(cfg, items) {
    var filters = state.activeFilters[activeTab];
    var filtered = items.filter(function (item) { return matchesFilters(item, cfg, filters) && AS.matches(item); });

    renderResultsCount(filtered.length);
    renderTable(cfg, filtered);
    renderPagination(cfg, filtered);
  }

  function renderResultsCount(total) {
    var el = document.getElementById('dc-results-count');
    if (!total) { el.innerHTML = '<strong>0</strong> datasets found'; return; }
    var start = (state.currentPage - 1) * PER_PAGE + 1;
    var end = Math.min(state.currentPage * PER_PAGE, total);
    el.innerHTML = 'Showing <strong>' + start + '&ndash;' + end + '</strong> of <strong>' + total + '</strong> datasets';
  }

  function badgeList(values, cap) {
    if (!values || !values.length) return '<span class="dc-muted-cell">&mdash;</span>';
    var shown = values.slice(0, cap);
    var html = '<div class="dc-badges">' + shown.map(function (v) {
      return '<span class="dc-badge" title="' + escHtml(v) + '">' + escHtml(v) + '</span>';
    }).join('');
    if (values.length > cap) html += '<span class="dc-badge dc-badge-more">+' + (values.length - cap) + '</span>';
    return html + '</div>';
  }

  function specItem(label, value) {
    var display = Array.isArray(value) ? value.join(', ') : value;
    return '<div><div class="dc-spec-item-label">' + escHtml(label) + '</div><div class="dc-spec-item-value">' + escHtml(display || 'N/A') + '</div></div>';
  }

  function renderDetailActions(item, itemUrl) {
    var inCart = AppenQuoteCart.has(item.datasetId);
    return '<div class="dc-detail-actions">' +
      '<button type="button" class="dc-detail-action dc-add-btn' + (inCart ? ' added' : '') + '" data-add-id="' + escHtml(item.datasetId) + '" data-add-name="' + escHtml(item.title) + '" data-add-url="' + escHtml(itemUrl) + '" aria-pressed="' + (inCart ? 'true' : 'false') + '" aria-label="' + (inCart ? 'Remove ' + escHtml(item.title) + ' from quote' : 'Add ' + escHtml(item.title) + ' to quote') + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2.41 12.41A2 2 0 0 1 2 11V4a2 2 0 0 1 2-2h7a2 2 0 0 1 1.41.59l8.18 8.18a2 2 0 0 1 0 2.83Z"/><circle cx="7.5" cy="7.5" r="1.4" fill="none"/></svg>' +
        '<span class="dc-detail-action-label-off">Add to quote</span>' +
        '<span class="dc-detail-action-label-on">Added to quote</span>' +
      '</button>' +
      '<button type="button" class="dc-detail-action dc-contact-btn" data-contact-id="' + escHtml(item.datasetId) + '" data-contact-name="' + escHtml(item.title) + '" data-contact-url="' + escHtml(itemUrl) + '" aria-label="Contact sales about ' + escHtml(item.title) + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2Z"/><polyline points="22 6 12 13 2 6"/></svg>' +
        '<span>Contact sales</span>' +
      '</button>' +
    '</div>';
  }

  function renderDetailPanel(cfg, item, itemUrl) {
    var heroCol = cfg.columns.filter(function (c) { return c.hero; })[0];
    var hero = '';
    if (heroCol && item[heroCol.key] && item[heroCol.key].length) {
      hero = '<div class="dc-hero-badges"><div class="dc-spec-label">' + escHtml(heroCol.label) + '</div>' + badgeList(item[heroCol.key], 999) + '</div>';
    }

    var description = '';
    if (cfg.descriptionKey && item[cfg.descriptionKey]) {
      description = '<p class="dc-description">' + escHtml(item[cfg.descriptionKey]) + '</p>';
    }

    var specs = cfg.specFields.map(function (f) { return specItem(f.label, item[f.key]); }).join('');

    var top = '<div class="dc-detail-top"><div class="dc-detail-top-main">' + description + '</div>' + renderDetailActions(item, itemUrl) + '</div>';

    return '<div class="dc-detail-inner">' + top + hero + '<div class="dc-spec-label">Spec sheet</div><div class="dc-spec-grid">' + specs + '</div></div>';
  }

  function renderTable(cfg, filtered) {
    var tbody = document.getElementById('dc-tbody');
    var start = (state.currentPage - 1) * PER_PAGE;
    var page = filtered.slice(start, start + PER_PAGE);
    var totalCols = cfg.columns.length + 2;

    if (!page.length) {
      tbody.innerHTML = '<tr><td colspan="' + totalCols + '">' + AS.emptyHtml(state.activeFilters[activeTab]) + '</td></tr>';
      return;
    }

    tbody.innerHTML = page.map(function (item, i) {
      var rowId = 'dc-row-' + i;
      var cells = cfg.columns.map(function (c) {
        if (c.multi) return '<td>' + badgeList(item[c.key], 3) + '</td>';
        var cls = c.size ? 'dc-size' : 'dc-muted-cell';
        return '<td class="' + cls + '">' + escHtml(item[c.key] || '—') + '</td>';
      }).join('');

      var itemUrl = '/data-catalog/' + encodeURIComponent(item.collection) + '/' + encodeURIComponent(item.slug);
      var inCart = AppenQuoteCart.has(item.datasetId);

      var mainRow =
        '<tr class="dc-row" data-row="' + rowId + '">' +
          '<td class="dc-col-actions"><div class="dc-row-actions">' +
            '<button type="button" class="dc-icon-btn dc-expand-btn" aria-expanded="false" aria-label="Show details for ' + escHtml(item.title) + '">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            '</button>' +
            '<button type="button" class="dc-icon-btn dc-add-btn' + (inCart ? ' added' : '') + '" data-add-id="' + escHtml(item.datasetId) + '" data-add-name="' + escHtml(item.title) + '" data-add-url="' + escHtml(itemUrl) + '" aria-pressed="' + (inCart ? 'true' : 'false') + '" aria-label="' + (inCart ? 'Remove ' + escHtml(item.title) + ' from quote' : 'Add ' + escHtml(item.title) + ' to quote') + '" title="' + (inCart ? 'Added to quote' : 'Add to quote') + '">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2.41 12.41A2 2 0 0 1 2 11V4a2 2 0 0 1 2-2h7a2 2 0 0 1 1.41.59l8.18 8.18a2 2 0 0 1 0 2.83Z"/><circle cx="7.5" cy="7.5" r="1.4" fill="none"/></svg>' +
            '</button>' +
          '</div></td>' +
          '<td class="dc-name-cell"><div class="dc-name">' + (item.featured ? '<span class="dc-featured-star" title="Featured">&#9733;</span>' : '') + '<a class="dc-name-link" href="' + itemUrl + '">' + escHtml(item.title) + '</a></div><div class="dc-id">' + escHtml(item.datasetId) + '</div></td>' +
          cells +
        '</tr>';
      var detailRow = '<tr class="dc-detail-row" data-detail="' + rowId + '"><td colspan="' + totalCols + '">' + renderDetailPanel(cfg, item, itemUrl) + '</td></tr>';
      return mainRow + detailRow;
    }).join('');

    tbody.querySelectorAll('.dc-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('a, .dc-add-btn')) return;
        if (String(window.getSelection())) return;
        var detail = tbody.querySelector('[data-detail="' + row.dataset.row + '"]');
        var opening = !detail.classList.contains('open');
        detail.classList.toggle('open', opening);
        row.classList.toggle('expanded', opening);
        row.querySelector('.dc-expand-btn').setAttribute('aria-expanded', opening);
      });
    });

    tbody.querySelectorAll('[data-add-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wasInCart = AppenQuoteCart.has(btn.dataset.addId);
        AppenQuoteCart.toggle({
          id: btn.dataset.addId,
          name: btn.dataset.addName,
          url: btn.dataset.addUrl
        });
        showToast(wasInCart ? 'Removed from quote' : 'Added to quote', wasInCart ? null : AQ_CHECK_ICON);
      });
    });

    tbody.querySelectorAll('[data-contact-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        AppenQuoteCart.add({
          id: btn.dataset.contactId,
          name: btn.dataset.contactName,
          url: btn.dataset.contactUrl
        });
        openQuoteModal();
      });
    });
  }

  function renderPagination(cfg, filtered) {
    var pagination = document.getElementById('dc-pagination');
    var total = Math.ceil(filtered.length / PER_PAGE);

    if (total <= 1) { pagination.innerHTML = ''; return; }

    var html = '<button type="button" class="dc-page-btn" id="dc-prev"' + (state.currentPage === 1 ? ' disabled' : '') + ' aria-label="Previous page">&#8592;</button>';

    for (var i = 1; i <= total; i++) {
      if (total > 7 && i > 2 && i < total - 1 && Math.abs(i - state.currentPage) > 1) {
        if (i === 3 || i === total - 2) html += '<span class="dc-page-ellipsis">&hellip;</span>';
        continue;
      }
      html += '<button type="button" class="dc-page-btn' + (i === state.currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }

    html += '<button type="button" class="dc-page-btn" id="dc-next"' + (state.currentPage === total ? ' disabled' : '') + ' aria-label="Next page">&#8594;</button>';
    pagination.innerHTML = html;

    function goToPage(p) {
      state.currentPage = p;
      var items = byTab[activeTab];
      applyAndRender(cfg, items);
      document.getElementById('appen-catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    pagination.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () { goToPage(parseInt(btn.dataset.page, 10)); });
    });
    var prev = document.getElementById('dc-prev');
    var next = document.getElementById('dc-next');
    if (prev) prev.addEventListener('click', function () { if (state.currentPage > 1) goToPage(state.currentPage - 1); });
    if (next) next.addEventListener('click', function () { if (state.currentPage < total) goToPage(state.currentPage + 1); });
  }

  // The module owns #dc-search-mount and, while a query is active, #dc-panel;
  // this file stays the sole writer of activeTab so the two can't disagree.
  // getItems is a GETTER -- byTab is null now and reassigned by loadIndex.
  // Returns a tab key when ?q= is present, so a shared link opens on All.
  var searchTab = AS.init({
    tabs: TABS, config: TAB_CONFIG, load: loadIndex, panel: panelEl,
    mount: document.getElementById('dc-search-mount'),
    getItems: function () { return byTab; },
    getActiveTab: function () { return activeTab; },
    setActiveTab: function (k) { activeTab = k; state.currentPage = 1; renderTabs(); renderPanel(); },
    onChange: function () { state.currentPage = 1; renderTabs(); renderPanel(); }
  });
  if (searchTab) activeTab = searchTab;

  renderTabs();
  renderPanel();

})();
