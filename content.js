// Content script: injected on dash.cloudflare.com. Observes the Pages
// dashboard DOM and reports the current deployment status to the service
// worker. Uses a MutationObserver (instant reaction to SPA updates) plus a
// polling fallback (safety net), both debounced/throttled to stay light.
//
// This file is a classic content script (not a module) and shares scope with
// utils/constants.js, utils/status.js and utils/storage.js, which the manifest
// injects before it.

(() => {
  "use strict";

  // Matches Pages project & deployment URLs, e.g.
  //   /<account>/pages/view/<project>
  //   /<account>/pages/view/<project>/<deploymentId>
  const PAGE_RE = /\/pages\/view\/([^/?#]+)(?:\/([^/?#]+))?/;

  // URL segments that are sub-pages, not deployment IDs.
  const SUBPAGES = new Set([
    "deployments",
    "settings",
    "functions",
    "builds",
    "metrics",
    "domains",
    "preview",
    "analytics",
  ]);

  let observer = null;
  let pollTimer = null;
  let debounceTimer = null;
  let monitoring = false;
  let pollIntervalMs = CFPN_DEFAULT_SETTINGS.pollInterval * 1000;
  let lastSentStatus = null;
  let lastContextKey = null;

  // --- Context ------------------------------------------------------------

  function parseContext() {
    const m = location.pathname.match(PAGE_RE);
    if (!m) return null;
    const project = decodeURIComponent(m[1]);
    const seg2 = m[2] ? decodeURIComponent(m[2]) : null;
    const deploymentId =
      seg2 && !SUBPAGES.has(seg2.toLowerCase()) ? seg2 : null;
    return { project, deploymentId };
  }

  // --- Status scan --------------------------------------------------------

  // Walk visible text nodes, keep the ones whose text is an exact status
  // badge, and pick the top-most one — the header/latest-row badge that
  // represents the deployment's overall status.
  function scanStatus(ctx) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const v = node.nodeValue;
          if (!v) return NodeFilter.FILTER_REJECT;
          const t = v.trim().toLowerCase();
          if (t.length === 0 || t.length > 14) return NodeFilter.FILTER_REJECT;
          return CFPN_BADGE_WORDS[t]
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );

    const candidates = [];
    let node;
    let guard = 0;
    while ((node = walker.nextNode()) && guard++ < 400) {
      const el = node.parentElement;
      if (!el) continue;
      const status = cfpnBadgeStatus(node.nodeValue);
      if (!status) continue;
      const rect = el.getBoundingClientRect();
      // Ignore zero-size (hidden/detached) nodes.
      if (rect.width === 0 && rect.height === 0) continue;
      candidates.push({ status, top: rect.top, el });
    }

    if (candidates.length === 0) return { status: "none", deploymentId: ctx.deploymentId };

    candidates.sort((a, b) => a.top - b.top);
    const chosen = candidates[0];

    // Resolve a deployment id: prefer the URL, else the badge's nearest
    // deployment link.
    let deploymentId = ctx.deploymentId;
    if (!deploymentId) {
      const link = chosen.el.closest('a[href*="/pages/view/"]');
      if (link) {
        const mm = link.getAttribute("href").match(PAGE_RE);
        if (mm && mm[2] && !SUBPAGES.has(mm[2].toLowerCase())) {
          deploymentId = decodeURIComponent(mm[2]);
        }
      }
    }
    return { status: chosen.status, deploymentId };
  }

  function scan() {
    if (!monitoring) return;
    const ctx = parseContext();
    if (!ctx) return;

    const result = scanStatus(ctx);
    const contextKey = ctx.project + "|" + (result.deploymentId || "latest");
    if (contextKey !== lastContextKey) {
      lastContextKey = contextKey;
      lastSentStatus = null; // new deployment context — allow re-reporting
    }

    if (result.status === "none") return; // nothing recognizable on this view
    if (result.status === lastSentStatus) return; // unchanged since last report
    lastSentStatus = result.status;

    // Send to the service worker. Swallow "no receiver" errors that can occur
    // while the worker is spinning up or the extension was just reloaded.
    try {
      chrome.runtime.sendMessage(
        {
          type: "cfpn-status",
          project: ctx.project,
          deploymentId: result.deploymentId,
          status: result.status,
          url: location.href,
          ts: Date.now(),
        },
        () => void chrome.runtime.lastError
      );
    } catch (_e) {
      // Extension context invalidated (e.g., reloaded) — next scan retries.
    }
  }

  function debouncedScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scan, 600);
  }

  // --- Lifecycle ----------------------------------------------------------

  function startObserving() {
    if (observer || !document.body) return;
    observer = new MutationObserver(debouncedScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    pollTimer = setInterval(scan, pollIntervalMs);
    scan();
  }

  function stopObserving() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    clearTimeout(debounceTimer);
    lastSentStatus = null;
  }

  function applyMonitoring(on) {
    monitoring = on;
    if (on && parseContext()) startObserving();
    else stopObserving();
  }

  function restartPollTimer() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = setInterval(scan, pollIntervalMs);
    }
  }

  async function init() {
    if (!parseContext()) return; // not a Pages project/deployment page
    const settings = await cfpnGetSettings();
    pollIntervalMs = Math.max(5, Number(settings.pollInterval) || 10) * 1000;
    const state = await cfpnGetState();
    applyMonitoring(!!state.monitoringEnabled);
  }

  // React to settings / monitoring toggles from the popup or options page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      const s = changes.settings.newValue || {};
      const ms = Math.max(5, Number(s.pollInterval) || 10) * 1000;
      if (ms !== pollIntervalMs) {
        pollIntervalMs = ms;
        restartPollTimer();
      }
    }
    if (changes.state) {
      applyMonitoring(!!(changes.state.newValue && changes.state.newValue.monitoringEnabled));
    }
  });

  // --- SPA navigation -----------------------------------------------------
  // The dashboard is a single-page app; patch the history API so route changes
  // re-evaluate context without a full page reload.
  function onRouteChange() {
    lastContextKey = null;
    lastSentStatus = null;
    if (monitoring) {
      if (parseContext()) startObserving();
      else stopObserving();
    }
  }

  const _pushState = history.pushState;
  history.pushState = function () {
    const ret = _pushState.apply(this, arguments);
    window.dispatchEvent(new Event("cfpn:locationchange"));
    return ret;
  };
  const _replaceState = history.replaceState;
  history.replaceState = function () {
    const ret = _replaceState.apply(this, arguments);
    window.dispatchEvent(new Event("cfpn:locationchange"));
    return ret;
  };
  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("cfpn:locationchange", onRouteChange);

  // Clean up on unload to avoid leaks.
  window.addEventListener("pagehide", stopObserving, { once: true });

  init();
})();
