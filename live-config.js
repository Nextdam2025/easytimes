// live-config.js  — read-only helper for the GitHub-backed config.json
const CONFIG_URL = "/data/config.json";         // served by your site (same as staff console uses)
const CACHE_KEY  = "ez_config_cache";
const LISTENERS  = new Set();

let config = null; // normalized shape (includes computed 'articles' array)

/** Subscribe to config updates (returns unsubscribe) */
export function subscribeConfig(fn) {
  LISTENERS.add(fn);
  if (config) fn(config);
  return () => LISTENERS.delete(fn);
}
function broadcast() { for (const fn of LISTENERS) fn(config); }

/** Cache helpers */
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(cfg) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
  broadcast(); // storage event not fired in the same tab
}

/** Public: fetch normalized config (uses cache, then refreshes) */
export async function getConfig(forceRemote = false) {
  if (!forceRemote && config) return config;

  if (!forceRemote) {
    const cached = readCache();
    if (cached) {
      config = cached;
      // soft refresh in background
      refreshFromRemote().catch(() => {});
      return config;
    }
  }

  await refreshFromRemote();
  return config;
}

/** Fetch /data/config.json and normalize to include cfg.articles[] */
async function refreshFromRemote() {
  const res = await fetch(CONFIG_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to fetch config.json");
  const raw = await res.json();
  config = normalize(raw);
  writeCache(config);
}

/** Turn {catalog, items, serviceMode, updatedAt} into a convenient shape */
function normalize(raw) {
  const catalog = Array.isArray(raw.catalog) ? raw.catalog : [];
  const items   = (raw.items && typeof raw.items === "object") ? raw.items : {};

  const catToId = (cat) => {
    const v = String(cat || "").toLowerCase();
    if (v.startsWith("hot"))    return "hot";
    if (v.startsWith("cold"))   return "cold";
    if (v.startsWith("snack"))  return "snacks";
    return "cold";
  };

  // Build a front-end-friendly articles[] the menu can use directly
  const articles = catalog.map(row => {
    const st = items[String(row.id)] || {};
    return {
      id: String(row.id),
      sku: String(row.id),
      name: row.name,
      categoryId: catToId(row.cat),
      price: Number(st.price ?? 0),
      vat: 0.09,
      active: st.available !== false,
      options: [],
      sort: Number(row.sort ?? row.id ?? 999)
    };
  });

  // Synthetic version just to aid consumers that check it
  const ver = Date.parse(raw.updatedAt || "") || Date.now();

  return {
    updatedAt: raw.updatedAt || new Date().toISOString(),
    serviceMode: raw.serviceMode === "self_pickup" ? "self_pickup" : "counter",
    catalog,
    items,
    // normalized fields for the UI
    articles,
    version: ver
  };
}

/** Cross-tab sync: when another tab saves to localStorage, adopt it here */
window.addEventListener("storage", (e) => {
  if (e.key === CACHE_KEY && e.newValue) {
    try {
      const next = JSON.parse(e.newValue);
      // minimal sanity check
      if (next && Array.isArray(next.articles)) {
        config = next;
        broadcast();
      }
    } catch {}
  }
});
