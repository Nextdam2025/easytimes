/* ============================================================
   EasyTimes — live-config.js (debug version)
   ============================================================ */

(() => {
  // Your config URL (public raw). Make sure this matches where Staff Console writes!
  const CONFIG_URL = "https://raw.githubusercontent.com/Nextdam2025/easytimes/main/data/config.json";

  const POLL_MS = 15000;
  let LIVE = { serviceMode: "counter", items: {} };
  let indexed = []; // [{el, article, priceEl, addBtn}...]

  // --- Debug helpers ---
  window.ET_CONFIG_URL = CONFIG_URL;
  const log = (...a) => console.log("[ET]", ...a);

  // On-screen status pill
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;right:10px;bottom:10px;padding:6px 10px;border-radius:999px;background:#1c1c1c;border:2px solid #f26522;color:#ffa;z-index:99999;font:12px/1.2 monospace';
  function showStatus(txt){ dot.textContent = 'CFG: ' + txt; }
  document.addEventListener("DOMContentLoaded", () => { document.body.appendChild(dot); showStatus('loading…'); });

  // Format € price
  const euro = v => "€" + Number(v || 0).toFixed(2);

  // 1) Index all product cards by articleNumber taken from onclick string
  function indexItems() {
    indexed = [];
    document.querySelectorAll(".item").forEach(el => {
      const oc = el.getAttribute("onclick") || "";
      const m = oc.match(/articleNumber\s*:\s*(\d+)/);
      if (!m) return;
      const article = m[1];
      const priceEl = el.querySelector(".price") || el.querySelector("p");
      const addBtn = el.querySelector("button");
      indexed.push({ el, article, priceEl, addBtn });
    });
    log("Indexed items:", indexed.map(x=>x.article));
  }

  // 2) Apply config to DOM + local solo mode
  function applyConfig() {
    // Service mode → keep using your existing solo banner
    const isSelf = LIVE.serviceMode === "self_pickup";
    localStorage.setItem("soloMode", JSON.stringify(isSelf));
    const banner = document.getElementById("soloModeBanner");
    if (banner) banner.style.display = isSelf ? "block" : "none";

    // Items: set price & availability
    indexed.forEach(({ el, article, priceEl, addBtn }) => {
      const cfg = LIVE.items[article];
      if (cfg && priceEl) priceEl.textContent = euro(cfg.price);
      const available = cfg ? cfg.available !== false : true;
      el.classList.toggle("sold-out", !available);
      if (addBtn) addBtn.disabled = !available;
    });

    showStatus('OK @ ' + new Date().toLocaleTimeString());
  }

  // 3) Fetch config.json (no cache) and update
  async function refreshConfig() {
    try {
      const url = CONFIG_URL + "?t=" + Date.now();
      const res = await fetch(url, { cache: "no-store" });
      log("Fetch", url, "→", res.status, res.statusText);
      if (!res.ok) { showStatus('ERR ' + res.status); return; }
      const json = await res.json();
      window.ET_LAST_CFG = json; // expose for quick inspection
      LIVE = {
        serviceMode: json.serviceMode === "self_pickup" ? "self_pickup" : "counter",
        items: json.items || {}
      };
      log("Config applied:", json.updatedAt || "(no timestamp)", Object.keys(LIVE.items).length, "items");
      applyConfig();
    } catch (e) {
      log("Config fetch error:", e);
      showStatus('ERR (fetch)');
    }
  }

  // 4) Ensure the live price is used when adding to basket, and block if sold out
  const _origPrepare = window.prepareOptions;
  window.prepareOptions = function (article) {
    try {
      const cfg = LIVE.items[String(article.articleNumber)];
      if (cfg) {
        if (cfg.available === false) {
          (window.showNotification || (m => alert(m)))("⚠ This item is currently sold out.");
          return;
        }
        article.price = Number(cfg.price);
      }
    } catch {}
    return _origPrepare.call(this, article);
  };

  // 5) Boot
  document.addEventListener("DOMContentLoaded", () => {
    log("live-config.js loaded. CONFIG_URL:", CONFIG_URL);
    indexItems();
    refreshConfig();
    setInterval(refreshConfig, POLL_MS);
  });
})();


