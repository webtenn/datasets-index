/*
 * Appen Catalog Search -- global free-text search for the Full Data Catalog
 * page (data-catalog-embed.html) on the Webflow site. Loaded via a single
 * <script src> tag from that one page only -- deliberately NOT folded into
 * quote-cart.js, which also loads on all 8 single-item detail templates
 * that have no search. See the "Catalog search" section of that project's
 * CLAUDE.md for the design reasoning.
 *
 * Lives in an external file for the same reason quote-cart.js does: the
 * embed is a Webflow Custom Code Embed with a hard 50,000-character limit
 * and was already at ~47.4K before this feature existed.
 *
 * UNLIKE quote-cart.js, this module does NOT self-initialize. It depends on
 * TABS / TAB_CONFIG / activeTab / byTab, all of which are vars private to
 * the page script's own IIFE, and byTab is null until the index fetch
 * resolves. So on load this file does exactly one thing -- assign
 * window.AppenCatalogSearch -- and renders nothing until the page script
 * calls init() itself, handing over everything it needs.
 *
 * If this file fails to load (CDN down/blocked), the page script falls back
 * to a no-op shim and the catalog keeps working, just without search.
 *
 * Injects its own <style> tag on load -- no separate CSS file needed. Those
 * styles are scoped '#appen-catalog .dc-*' to match the embed's convention,
 * and deliberately define NO --dc-* tokens: they are inherited from the
 * embed so the two can never drift apart on a future contrast pass.
 */
(function () {

  var ALL_KEY = 'dc-all';
  var MIN_LEN = 2;             // 1 char matches ~everything; not useful
  var INPUT_DEBOUNCE = 150;    // repaint cost, not match cost -- see CLAUDE.md
  var URL_DEBOUNCE = 400;      // longer, so we don't hammer replaceState
  var PER_PAGE = 20;           // matches the embed's own PER_PAGE

  // Separate script scope from the page's IIFE, so this file can't rely on
  // the page having defined escHtml first. Same reason quote-cart.js has
  // its own copy.
  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ---- State -----------------------------------------------------------

  var opts = null;
  var rawQuery = '';
  var tokens = [];
  var blobCache = new WeakMap();
  var counts = {};             // tab key -> match count, recomputed per query
  var allCount = 0;
  var preSearchTab = null;     // tab to restore when the query is cleared
  var page = 1;                // All-view pagination (own counter)
  var inputEl = null;
  var clearEl = null;
  var inputTimer = null;
  var urlTimer = null;

  // ---- Search index ----------------------------------------------------

  // Excluded by name, each for a concrete reason:
  //   id         -- 24-char hex ObjectId; "abc"/"dad" would hit items at random
  //   slug       -- lowercased duplicate of title; doubles the blob, zero recall
  //   url        -- contains the collection key, so "audio" would match all 200
  //   collection -- same problem: "dictionaries" would match all 154
  //   featured   -- it's a BOOLEAN; stringifying it puts "true" in every
  //                 featured item's blob, making `true` match all of them
  var SKIP = { id: 1, slug: 1, url: 1, collection: 1, featured: 1 };

  function fold(s) {
    return String(s).toLowerCase()
      // The corpus contains U+2011 NON-BREAKING HYPHEN, so someone typing an
      // ordinary ASCII "-" would otherwise get zero results.
      .replace(/[‐-―]/g, '-')
      .replace(/[‘’“”]/g, "'")
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function blobOf(item) {
    var parts = [], k, v;
    for (k in item) {
      if (!Object.prototype.hasOwnProperty.call(item, k) || SKIP[k]) continue;
      v = item[k];
      // The SAME key name carries a DIFFERENT type per collection --
      // `languages` is a string in tasks-verifiers but an array in
      // other-sets; `domainSubjectArea` is the reverse; `dataFormat`,
      // `annotation`, `dataCoveragePeriod` and `yearOfCollection` also vary.
      // So branch on Array.isArray, never on the key name. And walk the
      // object with for..in rather than a hand-written field list, so a new
      // field added to sync-datasets-index.js's FIELDS becomes searchable
      // here with no change.
      if (typeof v === 'string') parts.push(v);
      else if (Array.isArray(v)) parts.push(v.join(' '));
      // booleans (featured) and anything else are deliberately ignored
    }
    return fold(parts.join(' '));
  }

  // Keyed by the item object rather than stamped onto it as item.__blob --
  // a stamped property would be picked up by the for..in above on any
  // rebuild, folding the blob into itself.
  function blobFor(item) {
    var b = blobCache.get(item);
    if (b === undefined) { b = blobOf(item); blobCache.set(item, b); }
    return b;
  }

  function matches(item) {
    if (!tokens.length) return true;   // inactive: predicate is a no-op
    var b = blobFor(item);
    for (var i = 0; i < tokens.length; i++) {
      // Substring, not prefix: "span" must find Spanish, and "asr00" must
      // find USE_ASR008 mid-string.
      if (b.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  function isActive() { return tokens.length > 0; }

  function recount() {
    counts = {};
    allCount = 0;
    var byTab = opts.getItems();
    if (!byTab) return;
    opts.tabs.forEach(function (t) {
      var n = 0;
      (byTab[t.key] || []).forEach(function (item) { if (matches(item)) n++; });
      counts[t.key] = n;
      allCount += n;
    });
  }

  // Results in TABS order. loadIndex already sorted each bucket
  // featured-first then title A-Z, so this gives collections in tab order,
  // featured first within each, alphabetical after -- which is what makes
  // the collection badge read as a grouping rather than noise. No relevance
  // ranking: there's no signal to rank on, and an order the user can't
  // predict makes it impossible to tell whether search is working.
  function allResults() {
    var byTab = opts.getItems();
    if (!byTab) return [];
    var out = [];
    opts.tabs.forEach(function (t) {
      (byTab[t.key] || []).forEach(function (item) { if (matches(item)) out.push(item); });
    });
    return out;
  }

  function labelFor(key) {
    var t = opts.tabs.filter(function (x) { return x.key === key; })[0];
    return t ? t.label : key;
  }

  // ---- Styles ----------------------------------------------------------

  var CS_STYLE = `
  /* Search field (above the tab strip) */
  #appen-catalog .dc-search {
    position: relative;
    margin: 0 0 20px;
    max-width: 460px;
  }

  #appen-catalog .dc-search-input {
    width: 100%;
    font-family: var(--dc-font);
    font-size: 14px;
    color: var(--dc-text);
    background: var(--dc-bg-surface);
    border: 1px solid var(--dc-border);
    border-radius: var(--dc-radius-md);
    padding: 11px 38px 11px 38px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  #appen-catalog .dc-search-input::placeholder { color: var(--dc-text-muted); }
  #appen-catalog .dc-search-input:focus { border-color: var(--dc-accent); box-shadow: 0 0 0 3px var(--dc-accent-bg); }
  #appen-catalog .dc-search-input:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }

  #appen-catalog .dc-search-icon {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--dc-text-muted);
    pointer-events: none;
    display: flex;
  }

  #appen-catalog .dc-search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    display: none;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    padding: 0;
    border-radius: var(--dc-radius-sm);
    color: var(--dc-text-secondary);
    cursor: pointer;
  }

  #appen-catalog .dc-search.has-query .dc-search-clear { display: flex; }
  #appen-catalog .dc-search-clear:hover { background: var(--dc-bg-muted); color: var(--dc-text); }
  #appen-catalog .dc-search-clear:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }

  /* Per-tab match counts. --dc-text-secondary (#595959) rather than
     --dc-text-muted, so a zero-match tab can dim to muted and still clear
     the 4.5:1 AA floor -- see CLAUDE.md's contrast pass. */
  #appen-catalog .dc-tab-n {
    font-family: var(--dc-font-mono);
    font-size: 11px;
    color: var(--dc-text-secondary);
    margin-left: 6px;
  }

  #appen-catalog .dc-tab.active .dc-tab-n { color: var(--dc-accent); }

  /* Zero-match tabs dim but stay CLICKABLE on purpose: the user may need to
     go in and clear a filter that's contributing to the zero. Dimmed via
     font-weight + the muted token (#6e6e6e, still AA), never below it. */
  #appen-catalog .dc-tab.dc-tab-zero:not(.active) { color: var(--dc-text-muted); font-weight: 400; }
  #appen-catalog .dc-tab.dc-tab-zero:not(.active) .dc-tab-n { color: var(--dc-text-muted); }

  /* The All-results tab is a MODE, not a ninth collection -- its number slot
     reads "--" and a divider separates it from the numbered eight. */
  #appen-catalog .dc-tab-all { border-right: 1px solid var(--dc-border); margin-right: 4px; }

  /* All-results card grid */
  #appen-catalog .dc-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }

  /* Same surface tokens as .dc-table-wrap, so the All view reads as the
     same product as the per-tab tables rather than a bolted-on view. */
  #appen-catalog .dc-card {
    display: flex;
    flex-direction: column;
    background: var(--dc-bg-surface);
    border: 1px solid var(--dc-border);
    border-radius: var(--dc-radius-md);
    box-shadow: var(--dc-shadow-sm);
    padding: 16px 18px;
  }

  #appen-catalog .dc-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  #appen-catalog .dc-card-tab {
    font-family: var(--dc-font);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    /* NOT var(--dc-accent): accent text on the tinted accent background
       measures 4.39:1, under the 4.5:1 AA floor for text this size. This is
       the darker accent the 8 detail templates already introduced as
       --dc-accent-text for exactly this pairing; hardcoded rather than added
       as a token because the embed has no character budget to spare. */
    color: #8a5c44;
    background: var(--dc-accent-bg);
    border: 1px solid transparent;
    border-radius: 100px;
    padding: 3px 9px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  #appen-catalog .dc-card-tab:hover { border-color: var(--dc-accent); }
  #appen-catalog .dc-card-tab:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }

  #appen-catalog .dc-card-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
    margin: 0 0 3px;
  }

  #appen-catalog .dc-card-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--dc-text-secondary);
    margin: 10px 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* margin-top:auto pins the meta block to the card's baseline, so cards in
     a row stay equal height whether or not they have a description. 29% of
     items have none (76% of Pronunciation Dictionaries), so this is the
     typical case, not a corner case -- and the description element is
     omitted entirely when empty rather than rendered blank. */
  #appen-catalog .dc-card-meta { margin-top: auto; padding-top: 12px; }

  #appen-catalog .dc-card-size {
    display: block;
    font-family: var(--dc-font-mono);
    font-size: 11.5px;
    color: var(--dc-text-secondary);
    margin-bottom: 8px;
  }

  #appen-catalog .dc-card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--dc-border);
  }

  #appen-catalog .dc-all-hint {
    font-size: 13px;
    color: var(--dc-text-secondary);
    margin: 10px 0 0;
  }

  #appen-catalog .dc-all-hint button {
    font-family: var(--dc-font);
    font-size: 13px;
    color: var(--dc-accent);
    background: none;
    border: none;
    padding: 0;
    text-decoration: underline;
    cursor: pointer;
  }

  #appen-catalog .dc-all-hint button:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }

  @media (max-width: 640px) {
    #appen-catalog .dc-cards { grid-template-columns: 1fr; }
    #appen-catalog .dc-search { max-width: none; }
  }
  `;

  function injectStyle() {
    var s = document.createElement('style');
    s.textContent = CS_STYLE;
    document.head.appendChild(s);
  }

  // ---- Search field ----------------------------------------------------

  var SEARCH_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var CLEAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  function buildSearchField() {
    opts.mount.innerHTML =
      '<div class="dc-search" id="dc-search">' +
        '<span class="dc-search-icon">' + SEARCH_ICON + '</span>' +
        '<input type="search" class="dc-search-input" id="dc-search-input" ' +
          'placeholder="Search all 8 categories…" aria-label="Search all datasets" ' +
          'autocomplete="off" spellcheck="false">' +
        '<button type="button" class="dc-search-clear" id="dc-search-clear" aria-label="Clear search">' + CLEAR_ICON + '</button>' +
      '</div>';

    inputEl = document.getElementById('dc-search-input');
    clearEl = document.getElementById('dc-search-clear');

    inputEl.addEventListener('input', function () {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(function () { setQuery(inputEl.value); }, INPUT_DEBOUNCE);
    });

    // Clearing must be INSTANT -- a debounced clear feels broken.
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && inputEl.value) {
        e.preventDefault();
        doClear();
      }
    });

    clearEl.addEventListener('click', doClear);
  }

  function doClear() {
    clearTimeout(inputTimer);
    inputEl.value = '';
    setQuery('');
    inputEl.focus();
  }

  function syncFieldChrome() {
    document.getElementById('dc-search').classList.toggle('has-query', !!rawQuery);
  }

  // ---- Query changes ---------------------------------------------------

  function setQuery(raw) {
    var next = String(raw || '');
    var folded = fold(next).trim();
    var nextTokens = folded.length >= MIN_LEN ? folded.split(/\s+/).filter(Boolean) : [];

    var wasActive = isActive();
    rawQuery = next;
    tokens = nextTokens;
    var nowActive = isActive();

    syncFieldChrome();
    recount();
    page = 1;
    writeUrl();

    if (!wasActive && nowActive) {
      // Auto-select All exactly ONCE, on the inactive -> active transition.
      // That's the only moment a jump isn't disorienting, because the whole
      // UI just changed. Never again after that: yanking the user back to
      // All because a further keystroke dropped their chosen tab to zero
      // would steal focus mid-typing.
      preSearchTab = opts.getActiveTab();
      opts.setActiveTab(ALL_KEY);
      return;
    }

    if (wasActive && !nowActive) {
      // Query cleared. Restore the pre-search tab only if the user is still
      // sitting on All -- if they navigated to a real tab during the search
      // they made a choice, so respect it. This matters because the embed
      // also runs on the 8 sub-pages, where the tab is derived from the URL
      // path: dumping someone on Tasks & Verifiers after clearing a search
      // on /data-catalog/audio-catalogue/ would be plainly wrong.
      if (opts.getActiveTab() === ALL_KEY) {
        opts.setActiveTab(preSearchTab || opts.tabs[0].key);
        preSearchTab = null;
        return;
      }
      preSearchTab = null;
    }

    opts.onChange();
  }

  function writeUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try {
        var url = new URL(window.location.href);
        if (rawQuery) url.searchParams.set('q', rawQuery);
        else url.searchParams.delete('q');
        // replaceState, never pushState -- otherwise every keystroke
        // becomes a back-button step.
        window.history.replaceState(null, '', url.toString());
      } catch (e) { /* history unavailable (file://, sandbox) -- ignore */ }
    }, URL_DEBOUNCE);
  }

  // ---- All-results view ------------------------------------------------

  function badgeList(values, cap) {
    if (!values || !values.length) return '';
    var vals = Array.isArray(values) ? values : [values];
    var shown = vals.slice(0, cap);
    var html = '<div class="dc-badges">' + shown.map(function (v) {
      return '<span class="dc-badge" title="' + escHtml(v) + '">' + escHtml(v) + '</span>';
    }).join('');
    if (vals.length > cap) html += '<span class="dc-badge dc-badge-more">+' + (vals.length - cap) + '</span>';
    return html + '</div>';
  }

  var TAG_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2.41 12.41A2 2 0 0 1 2 11V4a2 2 0 0 1 2-2h7a2 2 0 0 1 1.41.59l8.18 8.18a2 2 0 0 1 0 2.83Z"/><circle cx="7.5" cy="7.5" r="1.4" fill="none"/></svg>';

  function renderCard(item) {
    var cfg = opts.config[item.collection] || {};
    var itemUrl = '/data-catalog/' + encodeURIComponent(item.collection) + '/' + encodeURIComponent(item.slug);
    var inCart = window.AppenQuoteCart ? AppenQuoteCart.has(item.datasetId) : false;

    // Only fields every collection provably has: the tab's own hero column
    // and size column, read from TAB_CONFIG rather than hardcoded here.
    var heroCol = (cfg.columns || []).filter(function (c) { return c.hero; })[0];
    var sizeCol = (cfg.columns || []).filter(function (c) { return c.size; })[0];

    var desc = cfg.descriptionKey ? (item[cfg.descriptionKey] || '') : '';
    // Omitted ENTIRELY when empty -- never an empty <p> holding a reserved
    // line-height, which is what makes a description-less grid look broken.
    var descHtml = desc ? '<p class="dc-card-desc">' + escHtml(desc) + '</p>' : '';

    var sizeVal = sizeCol ? item[sizeCol.key] : '';
    var sizeHtml = sizeVal
      ? '<span class="dc-card-size">' + escHtml(sizeCol.label) + ': ' + escHtml(Array.isArray(sizeVal) ? sizeVal.join(', ') : sizeVal) + '</span>'
      : '';
    var heroHtml = heroCol ? badgeList(item[heroCol.key], 3) : '';

    return '<article class="dc-card">' +
      '<div class="dc-card-head">' +
        '<button type="button" class="dc-card-tab" data-goto-tab="' + escHtml(item.collection) + '" ' +
          'aria-label="Show ' + escHtml(labelFor(item.collection)) + ' results">' + escHtml(labelFor(item.collection)) + '</button>' +
        (item.featured ? '<span class="dc-featured-star" title="Featured">&#9733;</span>' : '') +
      '</div>' +
      '<h3 class="dc-card-title"><a class="dc-name-link" href="' + itemUrl + '">' + escHtml(item.title) + '</a></h3>' +
      '<div class="dc-id">' + escHtml(item.datasetId) + '</div>' +
      descHtml +
      '<div class="dc-card-meta">' + sizeHtml + heroHtml + '</div>' +
      '<div class="dc-card-actions">' +
        '<button type="button" class="dc-icon-btn dc-add-btn' + (inCart ? ' added' : '') + '" ' +
          'data-add-id="' + escHtml(item.datasetId) + '" data-add-name="' + escHtml(item.title) + '" data-add-url="' + escHtml(itemUrl) + '" ' +
          'aria-pressed="' + (inCart ? 'true' : 'false') + '" ' +
          'aria-label="' + (inCart ? 'Remove ' + escHtml(item.title) + ' from quote' : 'Add ' + escHtml(item.title) + ' to quote') + '" ' +
          'title="' + (inCart ? 'Added to quote' : 'Add to quote') + '">' + TAG_ICON +
        '</button>' +
      '</div>' +
    '</article>';
  }

  function renderAllPagination(total) {
    var el = document.getElementById('dc-all-pagination');
    if (!el) return;
    var pages = Math.ceil(total / PER_PAGE);
    if (pages <= 1) { el.innerHTML = ''; return; }

    var html = '<button type="button" class="dc-page-btn"' + (page === 1 ? ' disabled' : '') + ' data-all-step="-1" aria-label="Previous page">&#8592;</button>';
    for (var i = 1; i <= pages; i++) {
      if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) {
        if (i === 3 || i === pages - 2) html += '<span class="dc-page-ellipsis">&hellip;</span>';
        continue;
      }
      html += '<button type="button" class="dc-page-btn' + (i === page ? ' active' : '') + '" data-all-page="' + i + '">' + i + '</button>';
    }
    html += '<button type="button" class="dc-page-btn"' + (page === pages ? ' disabled' : '') + ' data-all-step="1" aria-label="Next page">&#8594;</button>';
    el.innerHTML = html;

    function go(p) {
      page = p;
      paintAll();
      document.getElementById('appen-catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    el.querySelectorAll('[data-all-page]').forEach(function (b) {
      b.addEventListener('click', function () { go(parseInt(b.dataset.allPage, 10)); });
    });
    el.querySelectorAll('[data-all-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = page + parseInt(b.dataset.allStep, 10);
        if (next >= 1 && next <= pages) go(next);
      });
    });
  }

  function paintAll() {
    var results = allResults();
    var panel = opts.panel;

    if (!results.length) {
      panel.innerHTML =
        '<div class="dc-panel-head"><span class="dc-panel-count">--</span><span class="dc-panel-title">All results</span></div>' +
        '<div class="dc-empty"><h3>No datasets match &ldquo;' + escHtml(rawQuery) + '&rdquo;</h3>' +
        '<p>Try a shorter or different term, or clear the search to browse by category.</p>' +
        '<p class="dc-all-hint"><button type="button" data-clear-search>Clear search</button></p></div>';
      bindAll();
      return;
    }

    var start = (page - 1) * PER_PAGE;
    var slice = results.slice(start, start + PER_PAGE);
    var end = Math.min(start + PER_PAGE, results.length);

    panel.innerHTML =
      '<div class="dc-panel-head"><span class="dc-panel-count">--</span><span class="dc-panel-title">All results</span></div>' +
      '<p class="dc-panel-desc">Every category searched together. Pick a category badge on any result to see that collection&rsquo;s full columns and filters.</p>' +
      '<div class="dc-results-row"><span>Showing <strong>' + (start + 1) + '&ndash;' + end + '</strong> of <strong>' + results.length + '</strong> datasets</span></div>' +
      '<div class="dc-cards">' + slice.map(renderCard).join('') + '</div>' +
      '<div class="dc-pagination" id="dc-all-pagination"></div>';

    renderAllPagination(results.length);
    bindAll();
  }

  function bindAll() {
    var panel = opts.panel;

    panel.querySelectorAll('[data-goto-tab]').forEach(function (btn) {
      // Switches to that collection's real table WITH the search still
      // applied. All is for discovery ("where in this catalog is my term?");
      // the real tab is for evaluation ("show me the columns that matter").
      btn.addEventListener('click', function () { opts.setActiveTab(btn.dataset.gotoTab); });
    });

    panel.querySelectorAll('[data-clear-search]').forEach(function (btn) {
      btn.addEventListener('click', doClear);
    });

    // quote-cart.js's syncAddButtons selects '.dc-add-btn[data-add-id]'
    // document-wide, not scoped to the table, so these cards are picked up
    // by its existing onChange machinery with no change to that file. Only
    // the click handler has to be duplicated here.
    panel.querySelectorAll('[data-add-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.AppenQuoteCart) return;
        var wasInCart = AppenQuoteCart.has(btn.dataset.addId);
        AppenQuoteCart.toggle({ id: btn.dataset.addId, name: btn.dataset.addName, url: btn.dataset.addUrl });
        if (window.showToast) {
          showToast(wasInCart ? 'Removed from quote' : 'Added to quote', wasInCart ? null : window.AQ_CHECK_ICON);
        }
      });
    });
  }

  function renderAll() {
    var byTab = opts.getItems();
    if (byTab) { paintAll(); return; }

    // Reachable before the index resolves -- via a ?q= at load, or a very
    // fast typist. Mirror renderPanel's loading skeleton and its
    // still-on-this-tab guard.
    opts.panel.innerHTML = '<div class="dc-loading"><div class="dc-spinner"></div><p>Loading all categories&hellip;</p></div>';
    opts.load().then(function () {
      if (opts.getActiveTab() !== ALL_KEY) return;
      // init()'s own load handler registers first and repaints via onChange,
      // so on a ?q= cold start this would be a redundant second paint. The
      // skeleton still being on screen is what says it's still ours.
      if (!opts.panel.querySelector('.dc-loading')) return;
      recount();
      paintAll();
    }).catch(function () {
      if (opts.getActiveTab() !== ALL_KEY) return;
      opts.panel.innerHTML = '<div class="dc-empty"><h3>Couldn&rsquo;t load this catalog</h3><p>Please try refreshing the page.</p></div>';
    });
  }

  // Empty-state copy for a per-tab table. Lives here rather than in the
  // embed because it's search-aware wording and this file has no size limit.
  // "Clear a filter" is wrong advice when the query alone is excluding
  // everything -- and when the term matches in other tabs, say so rather
  // than silently jumping the user there mid-typing.
  function emptyHtml(activeFilters) {
    var solo = isActive() && !Object.keys(activeFilters || {}).length;
    var head = solo
      ? 'No results in this category'
      : 'No datasets match ' + (isActive() ? 'this search and these filters' : 'these filters');
    var hint = solo
      ? (allCount ? allCount + ' datasets match elsewhere &mdash; see All results.' : 'Try a different term.')
      : 'Try clearing a filter or two.';
    return '<div class="dc-empty"><h3>' + head + '</h3><p>' + hint + '</p></div>';
  }

  // ---- Init ------------------------------------------------------------

  function init(o) {
    opts = o;
    injectStyle();
    buildSearchField();

    // A ?q= at load makes a search shareable -- "here's a link to every
    // Spanish dataset we have". Read AFTER the page has resolved its own
    // tab from the URL path, so preSearchTab captures the right one.
    var startTab = null;
    var initial = '';
    try { initial = new URL(window.location.href).searchParams.get('q') || ''; } catch (e) { initial = ''; }
    if (initial) {
      inputEl.value = initial;
      rawQuery = initial;
      var folded = fold(initial).trim();
      tokens = folded.length >= MIN_LEN ? folded.split(/\s+/).filter(Boolean) : [];
      syncFieldChrome();
      if (tokens.length) startTab = ALL_KEY;
    }

    // Counts can't be computed until the index resolves. Recompute and
    // repaint once it does, so the tab strip is correct on first load.
    // Captured BEFORE we hand back ALL_KEY, so clearing a ?q= search returns
    // to whatever tab the page resolved from the URL path -- not TABS[0].
    if (startTab) preSearchTab = opts.getActiveTab();

    opts.load().then(function () {
      if (!isActive()) return;
      recount();
      opts.onChange();
    }).catch(function () { /* the page's own renderPanel reports the failure */ });

    // The page assigns this to activeTab before its first renderTabs(), so a
    // ?q= cold start opens on All with no double render.
    return startTab;
  }

  window.AppenCatalogSearch = {
    init: init,
    query: function () { return rawQuery; },
    isActive: isActive,
    matches: matches,
    countFor: function (key) { return isActive() ? (key === ALL_KEY ? allCount : (counts[key] || 0)) : 0; },
    renderAll: renderAll,
    emptyHtml: emptyHtml,
    ALL_KEY: ALL_KEY
  };

})();
