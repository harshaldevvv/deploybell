// Minimal Cloudflare API client for the Pages Deploy Notifier.
// Only read-only endpoints are used. A token scoped to
// "Account > Cloudflare Pages > Read" is all that's required.

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message);
    this.name = "CloudflareError";
    this.status = status ?? null;
    this.errors = errors ?? [];
  }
}

async function cfFetch(path, token, init = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (networkErr) {
    throw new CloudflareError(`Network error: ${networkErr.message}`, {});
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok || (body && body.success === false)) {
    const errors = (body && body.errors) || [];
    const msg =
      errors[0]?.message || `Cloudflare API error (HTTP ${res.status})`;
    throw new CloudflareError(msg, { status: res.status, errors });
  }

  return body ? body.result : null;
}

/** Verify a token is valid and active. Returns { id, status }. */
export function verifyToken(token) {
  return cfFetch("/user/tokens/verify", token);
}

/** List accounts the token can see. */
export function listAccounts(token) {
  return cfFetch("/accounts", token);
}

/** List Pages projects for an account. */
export function listProjects(accountId, token) {
  return cfFetch(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects`,
    token
  );
}

/**
 * List deployments for a project, newest first.
 * The API returns them sorted by created_on descending.
 */
export function listDeployments(accountId, projectName, token) {
  return cfFetch(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/` +
      `${encodeURIComponent(projectName)}/deployments`,
    token
  );
}

/**
 * Reduce a deployment object to a single high-level status.
 * @returns {"success"|"failure"|"canceled"|"building"|"queued"}
 */
export function normalizeStatus(deployment) {
  const stage = deployment?.latest_stage || {};
  const s = stage.status;

  if (s === "failure") return "failure";
  if (s === "canceled") return "canceled";
  // The deployment is only truly done when the final "deploy" stage succeeds.
  if (stage.name === "deploy" && s === "success") return "success";
  if (stage.name === "queued" || s === "idle") return "queued";
  return "building";
}

const STATUS_LABELS = {
  success: "Deployed",
  failure: "Failed",
  canceled: "Canceled",
  building: "Building",
  queued: "Queued",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}
