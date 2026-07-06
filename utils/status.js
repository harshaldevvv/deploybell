// Deployment-status classification. Deliberately free of DOM code so it can be
// shared across contexts and reasoned about in isolation. It matches
// Cloudflare's *badge vocabulary* rather than CSS classes, which keeps it
// resilient to dashboard restyling.

// Exact single-word badge text -> normalized status.
const CFPN_BADGE_WORDS = {
  queued: "running",
  initializing: "running",
  cloning: "running",
  building: "running",
  deploying: "running",
  uploading: "running",
  success: "success",
  succeeded: "success",
  failed: "failed",
  failure: "failed",
  canceled: "cancelled",
  cancelled: "cancelled",
};

// Authoritative classifier: only an exact single-word match counts. This is
// what makes detection robust — Cloudflare's status *badge* is a single word
// ("Building", "Success", "Failed"…), whereas build-log *stage labels* are
// phrases ("Building application", "Deploying to Cloudflare's global
// network"), so they are ignored and can't cause false positives.
function cfpnBadgeStatus(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase();
  if (t.length === 0 || t.length > 14) return null;
  return CFPN_BADGE_WORDS[t] || null;
}

// Loose fallback classifier for short strings, used only when no exact badge
// is found. More permissive, so it is a secondary signal.
function cfpnLooseStatus(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase();
  if (t.length === 0 || t.length > 48) return null;
  if (/\bcancell?ed\b|\baborted\b/.test(t)) return "cancelled";
  if (/\bfail(ed|ure)?\b|\berrored\b/.test(t)) return "failed";
  if (
    /\b(building|deploying|cloning|installing|initializing|queued|uploading|compiling|in progress)\b/.test(
      t
    )
  )
    return "running";
  if (/\bsuccess(ful)?\b|\bpublished\b/.test(t)) return "success";
  return null;
}

const CFPN_FINAL_STATUSES = new Set(["success", "failed", "cancelled"]);
function cfpnIsFinal(status) {
  return CFPN_FINAL_STATUSES.has(status);
}
