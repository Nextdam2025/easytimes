// live-config.js
const CONFIG_STORAGE_KEY = "ez_config_cache";
const LISTENERS = new Set();

let config = null;

/** Subscribe to config updates (returns unsubscribe fn) */
export function subscribeConfig(fn) {
  LISTENERS.add(fn);
  if (config) fn(config);
  return () => LISTENERS.delete(fn);
}

function broadcast() {
  for (const fn of LISTENERS) fn(config);
}

/** Read cached config from localStorage */
function readCache() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Write cache + fire storage event to other tabs */
function writeCache(cfg) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  // storage event only fires in *other* tabs, so we also call broadcast here
  broadcast();
}

/** Public: get config (loads once, returns same object) */
export async function getConfig(forceRemote = false) {
  if (!forceRemote && config) return config;

  // 1) try memory
  if (config && !forceRemote) return config;

  // 2) try local cache
  const cached = !forceRemote ? readCache() : null;
  if (cached) {
    config = cached;
    // kick off remote refresh in background
    refreshFromRemote().catch(() => {});
    return config;
  }

  // 3) hit remote
  await refreshFromRemote();
  return config;
}

/** Remote loader (replace URL with your raw file URL or endpoint) */
async function refreshFromRemote() {
  const url = "/data/config.json"; // e.g. /data/config.json or GitHub raw
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to fetch config.json");
  const remote = await res.json();
  validateConfig(remote);
  config = remote;
  writeCache(config);
}

/** Validate minimal shape */
function validateConfig(cfg) {
  if (typeof cfg !== "object" || !cfg) throw new Error("Invalid config");
  if (!Array.isArray(cfg.articles)) throw new Error("Invalid articles");
  if (typeof cfg.version !== "number") throw new Error("Missing version");
}

/** Save with optimistic locking; server must check `expectedVersion` */
export async function saveConfig(nextCfg, { expectedVersion }) {
  validateConfig(nextCfg);
  if (typeof expectedVersion !== "number") {
    throw new Error("saveConfig requires expectedVersion");
  }

  // Example: POST to your backend which commits to GitHub and returns new file
  const res = await fetch("/api/config/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedVersion,
      next: nextCfg
    })
  });

  if (res.status === 409) {
    // version mismatch → someone else saved first
    const latest = await res.json(); // { latest }
    // return the latest so UI can diff/merge or prompt user
    return { ok: false, reason: "version-conflict", latest: latest.latest };
  }

  if (!res.ok) throw new Error("Save failed");

  const saved = await res.json(); // { config }
  validateConfig(saved.config);
  config = saved.config;
  writeCache(config);
  return { ok: true, config };
}

/** Helpers for admin UI */
export function addArticle(fields) {
  const id = fields.id?.trim() || crypto.randomUUID();
  const base = { active: true, options: [], sort: 999 };
  const art = { ...base, ...fields, id };
  config.articles.push(art);
  return art;
}

export function updateArticle(id, patch) {
  const idx = config.articles.findIndex(a => a.id === id);
  if (idx === -1) throw new Error("Article not found");
  config.articles[idx] = { ...config.articles[idx], ...patch };
  return config.articles[idx];
}

export function removeArticle(id) {
  const idx = config.articles.findIndex(a => a.id === id);
  if (idx === -1) return false;
  config.articles.splice(idx, 1);
  return true;
}

/** Cross-tab sync */
window.addEventListener("storage", (e) => {
  if (e.key === CONFIG_STORAGE_KEY && e.newValue) {
    try {
      const next = JSON.parse(e.newValue);
      validateConfig(next);
      config = next;
      broadcast();
    } catch {}
  }
});
