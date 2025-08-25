<script>
/* ============================================================
   EasyTimes — live-config.js
   Reads config.json from GitHub and updates:
   - item prices (UI + the price used when adding to basket)
   - availability (adds “Sold out”, disables click)
   - service mode (counter vs self-pickup banner)
   Polls every 15s. Works with your current HTML as-is.
   ============================================================ */

(() => {
  // —— Pick where your config.json lives:

  // Option B (existing repo, e.g. /data/config.json):
  const CONFIG_URL = "https://raw.githubusercontent.com/Nextdam2025/easytimes/main/data/config.json";

  const POLL_MS = 15000;
  let LIVE = { serviceMode: "counter", items: {} };
  let indexed = []; // [{el, article, priceEl, addBtn}...]

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
  }

  // 3) Fetch config.json (no cache) and update
  async function refreshConfig() {
    try {
      const res = await fetch(CONFIG_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) {
        // If file doesn't exist yet or temporary error, keep old LIVE
        // console.debug("Config fetch:", res.status, res.statusText);
        return;
      }
      const json = await res.json();
      LIVE = {
        serviceMode: json.serviceMode === "self_pickup" ? "self_pickup" : "counter",
        items: json.items || {}
      };
       window.ET_CONFIG_URL = CONFIG_URL;
console.log("[ET] Config fetched", CONFIG_URL, json.updatedAt || "(no timestamp)");

      applyConfig();
    } catch (e) {
      // console.debug("Config fetch error:", e);
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
    indexItems();
    refreshConfig();
    setInterval(refreshConfig, POLL_MS);
  });
})();
</script>
