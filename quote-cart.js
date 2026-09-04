/*
 * Appen Quote Cart -- shared "Add to Quote" module for the Data Catalog
 * project (Webflow site, Appen). Loaded via a single <script src> tag
 * from the Full Data Catalog page (data-catalog-embed.html) and all 8
 * single-item detail templates (detail-embeds/*.html), instead of
 * duplicating this ~22KB block inline in all 9 Custom Code Embeds --
 * see the "Request a Quote cart" section of that project's CLAUDE.md
 * for the full history (why this exists, past bugs, the HubSpot wiring).
 *
 * This script must load BEFORE each page's own embed script, since it
 * self-initializes and exposes exactly four globals those page scripts
 * call into: window.AppenQuoteCart, window.showToast, window.AQ_CHECK_ICON,
 * window.openQuoteModal (for a page's own secondary "contact sales"-style
 * link to open the same Request-a-Quote modal without an add/remove).
 * Everything else here is intentionally private to this file's IIFE.
 *
 * Injects its own <style> tag on load -- no separate CSS file needed.
 */
(function () {

  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var AQ_STYLE = `
  /* Quote tray + Request a Quote modal. Root id is #aq-cart / #aq-modal
     on every page -- only one instance ever renders per page load, so
     no per-page scoping is needed the way each page's own table/detail
     styles need it. */
  #aq-cart, #aq-modal-overlay {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    box-sizing: border-box;
  }
  #aq-cart *, #aq-modal-overlay * { box-sizing: border-box; }

  #aq-cart {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 999;
    display: none;
  }
  #aq-cart.aq-visible { display: block; }

  #aq-cart .aq-pill {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 44px;
    padding: 0 16px 0 14px;
    /* Terracotta, not near-black -- this pill is meant to sit over
       whatever's on the page, including a black site footer (same
       #121212 as the old background), which made it nearly disappear.
       Terracotta reads clearly against both black and the cream page. */
    background: #95654b;
    color: #fff;
    border: none;
    border-radius: 100px;
    box-shadow: 0 6px 20px rgba(18,18,18,0.28);
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, transform 0.15s;
  }
  #aq-cart .aq-pill:hover { background: #7d5240; }
  #aq-cart .aq-pill:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  #aq-cart.aq-just-added .aq-pill { animation: aq-pop 0.3s ease; }
  @keyframes aq-pop { 0% { transform: scale(1); } 45% { transform: scale(1.08); } 100% { transform: scale(1); } }

  #aq-cart .aq-pill-count {
    font-family: 'DM Mono', 'SF Mono', Consolas, monospace;
    font-size: 12px;
    font-weight: 500;
    background: #121212;
    color: #fff;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #aq-cart .aq-pill-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  #aq-cart .aq-panel {
    position: absolute;
    bottom: 56px;
    right: 0;
    width: 340px;
    max-height: 60vh;
    background: #fff;
    border: 1px solid #e2e2de;
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(18,18,18,0.16);
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  #aq-cart.aq-open .aq-panel { display: flex; }

  @media (max-width: 480px) {
    #aq-cart { right: 12px; bottom: 12px; left: 12px; }
    #aq-cart .aq-panel { width: 100%; }
    #aq-cart .aq-pill { width: 100%; justify-content: center; }
  }

  #aq-cart .aq-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid #e2e2de;
    flex-shrink: 0;
  }

  #aq-cart .aq-panel-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #121212;
  }

  #aq-cart .aq-panel-minimize {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #6e6e6e;
    border-radius: 6px;
    cursor: pointer;
  }
  #aq-cart .aq-panel-minimize:hover { color: #121212; background: #f2f2f0; }
  #aq-cart .aq-panel-minimize:focus-visible { outline: 2px solid #95654b; outline-offset: 1px; }

  /* Sits below the header's divider, not beside the title -- so it can no
     longer be mis-clicked while reaching for the minimize button above it. */
  #aq-cart .aq-panel-subrow {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px 2px;
    flex-shrink: 0;
  }

  #aq-cart .aq-panel-clear {
    font-size: 11.5px;
    font-weight: 500;
    color: #6e6e6e;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
  }
  #aq-cart .aq-panel-clear:hover { color: #95654b; }
  #aq-cart .aq-panel-clear:focus-visible { outline: 2px solid #95654b; outline-offset: 1px; }

  #aq-cart .aq-list {
    overflow-y: auto;
    padding: 6px 8px;
    flex: 1 1 auto;
  }

  #aq-cart .aq-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 8px;
    border-radius: 8px;
  }
  #aq-cart .aq-item:hover { background: #f9f9f7; }

  #aq-cart .aq-item-main { flex: 1 1 auto; min-width: 0; }

  #aq-cart .aq-item-name {
    font-size: 12.5px;
    font-weight: 600;
    color: #121212;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
    display: block;
  }
  #aq-cart .aq-item-name:hover { color: #95654b; }

  #aq-cart .aq-item-id {
    font-family: 'DM Mono', 'SF Mono', Consolas, monospace;
    font-size: 10px;
    color: #6e6e6e;
    margin-top: 1px;
  }

  #aq-cart .aq-item-remove {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #6e6e6e;
    border-radius: 5px;
    cursor: pointer;
  }
  #aq-cart .aq-item-remove:hover { color: #b3392f; background: #f7f0ec; }
  #aq-cart .aq-item-remove:focus-visible { outline: 2px solid #95654b; outline-offset: 1px; }

  #aq-cart .aq-panel-foot { padding: 12px; border-top: 1px solid #e2e2de; flex-shrink: 0; }

  #aq-cart .aq-btn-request {
    width: 100%;
    height: 42px;
    background: #121212;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  #aq-cart .aq-btn-request:hover { background: #95654b; }
  #aq-cart .aq-btn-request:focus-visible { outline: 2px solid #95654b; outline-offset: 2px; }

  /* ---- Request a Quote modal ---- */
  #aq-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(18,18,18,0.5);
    z-index: 1000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  #aq-modal-overlay.aq-open { display: flex; }

  #aq-modal-overlay .aq-modal {
    width: 100%;
    max-width: 560px;
    max-height: 86vh;
    background: #f9f9f7;
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(18,18,18,0.28);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #aq-modal-overlay .aq-modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 24px 16px;
    flex-shrink: 0;
  }

  #aq-modal-overlay .aq-modal-title { font-size: 19px; font-weight: 700; color: #121212; margin: 0 0 4px; letter-spacing: -0.01em; }
  #aq-modal-overlay .aq-modal-desc { font-size: 13px; color: #595959; margin: 0; line-height: 1.5; max-width: 42ch; }

  #aq-modal-overlay .aq-modal-close {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #6e6e6e;
    border-radius: 7px;
    cursor: pointer;
  }
  #aq-modal-overlay .aq-modal-close:hover { color: #121212; background: #f2f2f0; }
  #aq-modal-overlay .aq-modal-close:focus-visible { outline: 2px solid #95654b; outline-offset: 2px; }

  #aq-modal-overlay .aq-modal-body { overflow-y: auto; padding: 0 24px 24px; }

  #aq-modal-overlay .aq-modal-cart-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6e6e6e;
    margin-bottom: 8px;
  }

  #aq-modal-overlay .aq-modal-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }

  #aq-modal-overlay .aq-modal-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 500;
    padding: 5px 6px 5px 11px;
    border-radius: 100px;
    background: #fff;
    border: 1px solid #e2e2de;
    color: #595959;
  }

  #aq-modal-overlay .aq-modal-chip button {
    width: 17px;
    height: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f2f2f0;
    border: none;
    border-radius: 50%;
    color: #6e6e6e;
    cursor: pointer;
    padding: 0;
  }
  #aq-modal-overlay .aq-modal-chip button:hover { background: #f7f0ec; color: #95654b; }
  #aq-modal-overlay .aq-modal-chip button:focus-visible { outline: 2px solid #95654b; outline-offset: 1px; }

  #aq-modal-overlay .aq-hubspot-slot {
    background: #fff;
    border: 1px solid #e2e2de;
    border-radius: 10px;
    padding: 18px;
    min-height: 120px;
  }

  #aq-modal-overlay .aq-hubspot-error {
    font-size: 12.5px;
    color: #6e6e6e;
    line-height: 1.6;
    margin: 0;
  }

  /* Toast -- brief confirmation on add/remove, since the quote tray
     itself (bottom-right) is easy to miss on first use. Bottom-center
     on purpose, clear of the tray pill. */
  #aq-toast {
    position: fixed;
    left: 50%;
    bottom: 26px;
    z-index: 1002;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #121212;
    /* Same #121212 as a black site footer could sit behind this --
       unlike the pill (always on screen, recolored to terracotta), the
       toast is only ever visible for 2.2s, so a defining light border
       is enough rather than a full recolor (which would fight the
       green check icon's own contrast). */
    border: 1.5px solid rgba(255,255,255,0.32);
    color: #fff;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    font-weight: 600;
    padding: 11px 18px 11px 16px;
    border-radius: 100px;
    box-shadow: 0 10px 28px rgba(18,18,18,0.22);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  #aq-toast.aq-toast-show { opacity: 1; transform: translate(-50%, 0); }
  #aq-toast .aq-toast-icon { display: flex; flex-shrink: 0; color: #4fbd7e; }

  @media (max-width: 480px) {
    #aq-toast { left: 12px; right: 12px; bottom: 12px; transform: translateY(8px); }
    #aq-toast.aq-toast-show { transform: translateY(0); }
  }
`;
  var aqStyleEl = document.createElement('style');
  aqStyleEl.textContent = AQ_STYLE;
  document.head.appendChild(aqStyleEl);

  // Appen Quote Cart — shared module, duplicated verbatim across this
  // file and all 8 detail-embeds/*.html so "Add to Quote" and the
  // quote tray persist across the catalog page and every dataset page.
  // Storage is localStorage only (no backend) — same-origin, so any
  // appen.com page sees the same cart. Items are keyed by Dataset ID.
  // ==================================================================
  var AppenQuoteCart = (function () {
    var STORAGE_KEY = 'appenQuoteCart';
    var listeners = [];

    function read() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        var items = raw ? JSON.parse(raw) : [];
        return Array.isArray(items) ? items : [];
      } catch (e) { return []; }
    }

    function write(items) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
      listeners.forEach(function (fn) { fn(items); });
    }

    return {
      getAll: read,
      has: function (id) { return read().some(function (i) { return i.id === id; }); },
      add: function (item) {
        var items = read();
        if (items.some(function (i) { return i.id === item.id; })) return;
        items.push(item);
        write(items);
      },
      remove: function (id) {
        write(read().filter(function (i) { return i.id !== id; }));
      },
      toggle: function (item) {
        if (this.has(item.id)) { this.remove(item.id); } else { this.add(item); }
      },
      clear: function () { write([]); },
      onChange: function (fn) { listeners.push(fn); },
      // Plain-text summary for the HubSpot hidden field -- one line per
      // dataset as "Name (ID)". Swap the format here if the hidden field
      // expects something else (e.g. IDs only, or JSON).
      summaryText: function () {
        return read().map(function (i) { return i.name + ' (' + i.id + ')'; }).join('\n');
      }
    };
  })();
  window.AppenQuoteCart = AppenQuoteCart;

  // ---- Quote tray + Request a Quote modal (shared markup/behavior) ---

  function escAttr(str) { return escHtml(str).replace(/'/g, '&#39;'); }

  function buildQuoteCartUI() {
    var cartEl = document.createElement('div');
    cartEl.id = 'aq-cart';
    cartEl.innerHTML =
      '<div class="aq-panel">' +
        '<div class="aq-panel-head"><span class="aq-panel-title">Quote request</span>' +
          '<button type="button" class="aq-panel-minimize" id="aq-minimize" aria-label="Minimize quote panel" title="Minimize">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="aq-panel-subrow"><button type="button" class="aq-panel-clear" id="aq-clear">Clear all</button></div>' +
        '<div class="aq-list" id="aq-list"></div>' +
        '<div class="aq-panel-foot"><button type="button" class="aq-btn-request" id="aq-request">Request quote</button></div>' +
      '</div>' +
      '<button type="button" class="aq-pill" id="aq-pill" aria-expanded="false" aria-haspopup="true">' +
        '<span class="aq-pill-count" id="aq-pill-count">0</span>' +
        '<span class="aq-pill-label">Quote</span>' +
      '</button>';
    document.body.appendChild(cartEl);

    var modalEl = document.createElement('div');
    modalEl.id = 'aq-modal-overlay';
    modalEl.innerHTML =
      '<div class="aq-modal" role="dialog" aria-modal="true" aria-labelledby="aq-modal-title">' +
        '<div class="aq-modal-head">' +
          '<div><h2 class="aq-modal-title" id="aq-modal-title">Request a quote</h2>' +
          '<p class="aq-modal-desc">Confirm the datasets below, then tell us a bit about your project and we&rsquo;ll follow up with licensing and delivery details.</p></div>' +
          '<button type="button" class="aq-modal-close" id="aq-modal-close" aria-label="Close">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="aq-modal-body">' +
          '<div class="aq-modal-cart-label" id="aq-modal-cart-label"></div>' +
          '<div class="aq-modal-chips" id="aq-modal-chips"></div>' +
          '<div class="aq-hubspot-slot" id="aq-hubspot-slot"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    var toastEl = document.createElement('div');
    toastEl.id = 'aq-toast';
    document.body.appendChild(toastEl);

    document.getElementById('aq-pill').addEventListener('click', function () {
      var open = !cartEl.classList.contains('aq-open');
      cartEl.classList.toggle('aq-open', open);
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.getElementById('aq-minimize').addEventListener('click', function () {
      cartEl.classList.remove('aq-open');
      document.getElementById('aq-pill').setAttribute('aria-expanded', 'false');
    });

    document.getElementById('aq-clear').addEventListener('click', function () { AppenQuoteCart.clear(); });

    document.getElementById('aq-request').addEventListener('click', function () {
      cartEl.classList.remove('aq-open');
      openQuoteModal();
    });

    document.getElementById('aq-modal-close').addEventListener('click', closeQuoteModal);
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeQuoteModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalEl.classList.contains('aq-open')) closeQuoteModal();
    });
  }

  var AQ_CHECK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  window.AQ_CHECK_ICON = AQ_CHECK_ICON;
  var aqToastTimer = null;

  // Brief confirmation toast -- the quote tray pill (bottom-right) is easy
  // to miss on a first add, especially from a small icon-only control, so
  // this gives immediate feedback regardless of where on the page the
  // click happened. `icon` is optional raw SVG markup (e.g. AQ_CHECK_ICON).
  function showToast(message, icon) {
    var toast = document.getElementById('aq-toast');
    if (!toast) return;
    toast.innerHTML = (icon ? '<span class="aq-toast-icon">' + icon + '</span>' : '') + '<span>' + escHtml(message) + '</span>';
    toast.classList.add('aq-toast-show');
    clearTimeout(aqToastTimer);
    aqToastTimer = setTimeout(function () { toast.classList.remove('aq-toast-show'); }, 2200);
  }
  window.showToast = showToast;

  function renderQuoteTray(items) {
    var cartEl = document.getElementById('aq-cart');
    if (!cartEl) return;
    var hadItems = cartEl.classList.contains('aq-visible');
    cartEl.classList.toggle('aq-visible', items.length > 0);
    if (!hadItems && items.length > 0) {
      cartEl.classList.add('aq-just-added');
      setTimeout(function () { cartEl.classList.remove('aq-just-added'); }, 300);
    }

    document.getElementById('aq-pill-count').textContent = items.length;
    document.getElementById('aq-pill').setAttribute('aria-label',
      'Quote request, ' + items.length + (items.length === 1 ? ' dataset selected' : ' datasets selected'));

    var list = document.getElementById('aq-list');
    list.innerHTML = items.map(function (i) {
      return '<div class="aq-item">' +
        '<div class="aq-item-main"><a class="aq-item-name" href="' + escAttr(i.url) + '">' + escHtml(i.name) + '</a><div class="aq-item-id">' + escHtml(i.id) + '</div></div>' +
        '<button type="button" class="aq-item-remove" data-remove="' + escAttr(i.id) + '" aria-label="Remove ' + escAttr(i.name) + ' from quote">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');

    list.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { AppenQuoteCart.remove(btn.dataset.remove); });
    });
  }

  function renderModalChips(items) {
    document.getElementById('aq-modal-cart-label').textContent =
      items.length + (items.length === 1 ? ' dataset selected' : ' datasets selected');
    var chips = document.getElementById('aq-modal-chips');
    chips.innerHTML = items.map(function (i) {
      return '<span class="aq-modal-chip">' + escHtml(i.name) +
        '<button type="button" data-remove="' + escAttr(i.id) + '" aria-label="Remove ' + escAttr(i.name) + '">' +
          '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>' +
        '</button></span>';
    }).join('');
    chips.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { AppenQuoteCart.remove(btn.dataset.remove); });
    });
  }

  // ---- HubSpot form (real embed: portalId 48152462 / formId
  // 3d8a4044-3f16-4d0e-ad7d-8167e38dbfb8 / region na1, added 2026-09-04).
  // Loads HubSpot's own form script on first modal open, renders the
  // form into #aq-hubspot-slot, and keeps the "quote_cart_items" hidden
  // field (Multi-line text, in HubSpot) in sync with the cart -- on
  // first render, and again on every cart change while the modal is
  // open (e.g. removing a chip). Submitting the form clears the cart.
  var HS_PORTAL_ID = '48152462';
  var HS_FORM_ID = '3d8a4044-3f16-4d0e-ad7d-8167e38dbfb8';
  var HS_REGION = 'na1';
  var HS_HIDDEN_FIELD = 'quote_cart_items';
  var hsScriptLoading = false;

  function loadHubspotScript(cb, onerror) {
    if (window.hbspt) { cb(); return; }
    if (hsScriptLoading) {
      var check = setInterval(function () {
        if (window.hbspt) { clearInterval(check); cb(); }
      }, 50);
      return;
    }
    hsScriptLoading = true;
    var s = document.createElement('script');
    s.charset = 'utf-8';
    // Absolute https:// on purpose, not protocol-relative "//js.hsforms.net/..."
    // -- a protocol-relative URL resolves against file:// when this embed is
    // opened directly as a local file (becomes "file://js.hsforms.net/...",
    // which fails silently), even though it would've been fine on the real
    // https:// Webflow site. Absolute https:// works in both cases.
    s.src = 'https://js.hsforms.net/forms/embed/v2.js';
    s.onload = cb;
    s.onerror = function () { hsScriptLoading = false; if (onerror) onerror(); };
    document.head.appendChild(s);
  }

  function updateHubspotHiddenField() {
    // This portal renders the form inside an iframe (empty src, so still
    // same-origin) -- document.querySelector doesn't pierce into iframes
    // even when same-origin, so we have to go through contentDocument
    // explicitly. Falls back to searching the slot itself in case a
    // different portal config ever renders the form inline instead.
    var slot = document.getElementById('aq-hubspot-slot');
    var iframe = slot.querySelector('iframe');
    var doc = iframe ? iframe.contentDocument : slot;
    var field = doc && doc.querySelector('[name="' + HS_HIDDEN_FIELD + '"]');
    if (field) field.value = AppenQuoteCart.summaryText();
  }

  function renderHubspotSlot() {
    var slot = document.getElementById('aq-hubspot-slot');
    if (slot.dataset.filled) { updateHubspotHiddenField(); return; }
    slot.dataset.filled = 'true';
    loadHubspotScript(function () {
      hbspt.forms.create({
        portalId: HS_PORTAL_ID,
        formId: HS_FORM_ID,
        region: HS_REGION,
        target: '#aq-hubspot-slot',
        onFormReady: function () { updateHubspotHiddenField(); },
        onFormSubmitted: function () {
          AppenQuoteCart.clear();
          closeQuoteModal();
        }
      });
    }, function () {
      slot.dataset.filled = '';
      slot.innerHTML = '<p class="aq-hubspot-error">Couldn&rsquo;t load the request form. Please refresh the page and try again.</p>';
    });
  }

  function openQuoteModal() {
    var items = AppenQuoteCart.getAll();
    renderModalChips(items);
    renderHubspotSlot();
    document.getElementById('aq-modal-overlay').classList.add('aq-open');
    document.body.style.overflow = 'hidden';
  }
  window.openQuoteModal = openQuoteModal;

  function closeQuoteModal() {
    document.getElementById('aq-modal-overlay').classList.remove('aq-open');
    document.body.style.overflow = '';
  }

  function syncAddButtons(items) {
    var ids = {};
    items.forEach(function (i) { ids[i.id] = true; });
    document.querySelectorAll('.dc-add-btn[data-add-id]').forEach(function (btn) {
      var inCart = !!ids[btn.dataset.addId];
      var wasInCart = btn.classList.contains('added');
      btn.classList.toggle('added', inCart);
      btn.setAttribute('aria-pressed', inCart ? 'true' : 'false');
      btn.title = inCart ? 'Added to quote' : 'Add to quote';
      btn.setAttribute('aria-label', (inCart ? 'Remove ' : 'Add ') + btn.dataset.addName + (inCart ? ' from quote' : ' to quote'));
      if (inCart && !wasInCart) {
        btn.classList.add('dc-just-added');
        setTimeout(function () { btn.classList.remove('dc-just-added'); }, 280);
      }
    });
  }

  function initQuoteCart() {
    buildQuoteCartUI();
    AppenQuoteCart.onChange(function (items) {
      renderQuoteTray(items);
      syncAddButtons(items);
      if (document.getElementById('aq-modal-overlay').classList.contains('aq-open')) {
        renderModalChips(items);
        updateHubspotHiddenField();
      }
    });
    renderQuoteTray(AppenQuoteCart.getAll());
  }


  initQuoteCart();

})();
