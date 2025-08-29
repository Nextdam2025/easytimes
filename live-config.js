// live-config.js  (ES module)
const CONFIG_STORAGE_KEY = "ez_config_cache_v2";
const LISTENERS = new Set();

// configure where to load from (public repo = no token needed)
let SOURCE = {
  owner: "Nextdam2025",
  repo: "easytimes",
  branch: "main",
  path: "data/config.json"
};

export function configureSource({ owner, repo, branch = "main", path = "data/config.json" } = {}) {
  SOURCE = { owner, repo, branch, path };
}

let config = null;

export function subscribeConfig(fn) {
  LISTENERS.add(fn);
  if (config) fn(config);
  return () => LISTENERS.delete(fn);
}

function broadcast() { for (const fn of LISTENERS) fn(config); }

function readCache() {
  try { const raw = localStorage.getItem(CONFIG_STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function writeCache(cfg) { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg)); broadcast(); }

/* Public: get config (cached, then remote refresh) */
export async function getConfig(forceRemote = false) {
  if (config && !forceRemote) return config;
  if (!forceRemote) {
    const cached = readCache();
    if (cached) { config = cached; refreshFromRemote().catch(()=>{}); return config; }
  }
  await refreshFromRemote();
  return config;
}

/* Hit GitHub Contents API to avoid Pages lag */
async function refreshFromRemote() {
  const { owner, repo, branch, path } = SOURCE;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch config (${res.status})`);
  const j = await res.json();
  const decoded = JSON.parse(atob((j.content || "").replace(/\n/g, "")));

  validateConfig(decoded);
  config = decoded;
  writeCache(config);
}

function validateConfig(cfg) {
  if (typeof cfg !== "object" || !cfg) throw new Error("Invalid config");
  if (typeof cfg.version !== "number") throw new Error("Missing version");
  if (!Array.isArray(cfg.articles)) throw new Error("Invalid articles");
}

/* Optional helper writers for UIs that keep everything in-memory first */
export function addArticle(fields) {
  const id = fields.id ?? String(crypto.randomUUID());
  const base = { active: true, options: [], variants: null, sort: 999 };
  const art = { ...base, ...fields, id: String(id) };
  config.articles.push(art);
  return art;
}
export function updateArticle(id, patch) {
  const i = config.articles.findIndex(a => String(a.id) === String(id));
  if (i < 0) throw new Error("Article not found");
  config.articles[i] = { ...config.articles[i], ...patch };
  return config.articles[i];
}
export function removeArticle(id) {
  const i = config.articles.findIndex(a => String(a.id) === String(id));
  if (i < 0) return false;
  config.articles.splice(i, 1);
  return true;
}

/* Cross-tab sync */
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
