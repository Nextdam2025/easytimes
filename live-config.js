/* ============================================================
   EasyTimes — live-config.js (debug version, NO <script> tags)
   Reads config.json from GitHub and updates:
   - Prices on cards (now supports one-of variants)
   - Sold-out status (per variant; card sold-out iff all variants are)
   - Self pickup banner (serviceMode)
   Polls every 15s.
   ============================================================ */

(() => {
  // Must match where the Staff Console writes the JSON:
  const CONFIG_URL = "https://raw.githubusercontent.com/Nextdam2025/easytimes/main/data/config.json";

  const POLL_MS = 15000;
  let LIVE = { serviceMode: "counter", items: {} };

  // [{el, article, priceEl, addBtn, hasVariants, variantArticles:[]}]
  let indexed = [];

  // --- Debug helpers (visible in the dev console + small status pill) ---
  window.ET_CONFIG_URL = CONFIG_URL;
  const log = (...a) => console.log("[ET]", ...a);
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;right:10px;bottom:10px;padding:6px 10px;border-radius:999px;background:#1c1c1c;border:2px solid #f26522;color:#ffa;z-index:99999;font:12px/1.2 monospace';
  function showStatus(txt){ dot.textContent = 'CFG: ' + txt; }
  document.addEventListener("DOMContentLoaded", () => { document.body.appendChild(dot); showStatus('loading…'); });

  // Format € price
  const euro = v => "€" + Number(v || 0).toFixed(2);

  // --- Helpers to read live config ---
  const cfgOf = an => LIVE.items && LIVE.items[String(an)];
  const livePriceOr = (an, fallback) => {
    const c = cfgOf(an);
    return typeof c?.price === 'number' ? Number(c.price) : Number(fallback || 0);
  };
  const isAvailable = an => {
    const c = cfgOf(an);
    return c ? c.available !== false : true;
  };

  // Extract all articleNumbers from onclick; first is base, the rest (if any) are variant ANs
  function extractAllArticleNumbers(onclickStr){
    return [...(onclickStr || '').matchAll(/articleNumber\s*:\s*(\d+)/g)].map(m => m[1]);
  }

  // 1) Index all product cards by articleNumber taken from onclick string
  function indexItems() {
    indexed = [];
    document.querySelectorAll(".item").forEach(el => {
      const oc = el.getAttribute("onclick") || "";
      const allANs = extractAllArticleNumbers(oc);
      if (!allANs.length) return;
      const baseAn = allANs[0];
      const variantANs = allANs.slice(1); // if any
      const hasVariants = variantANs.length > 0;
      const priceEl = el.querySelector(".price") || el.querySelector("p");
      const addBtn = el.querySelector("button");
      indexed.push({ el, article: baseAn, priceEl, addBtn, hasVariants, variantArticles: variantANs, _oc: oc });
    });
    log("Indexed items:", indexed.map(x=> x.hasVariants ? `${x.article}→[${x.variantArticles.join(',')}]` : x.article));
  }

  // 2) Apply config to DOM + local solo mode
  function applyConfig() {
    // Service mode → show/hide banner
    const isSelf = LIVE.serviceMode === "self_pickup";
    localStorage.setItem("soloMode", JSON.stringify(isSelf));
    const banner = document.getElementById("soloModeBanner");
    if (banner) banner.style.display = isSelf ? "block" : "none";

    // Items: set price & availability
    indexed.forEach(({ el, article, priceEl, addBtn, hasVariants, variantArticles }) => {
      if (hasVariants && variantArticles.length) {
        // Compute per-variant live prices and availability
        const pricesAvail = variantArticles.map(an => ({
          an,
          price: livePriceOr(an, undefined),
          available: isAvailable(an)
        }));

        const anyAvail = pricesAvail.some(x => x.available);
        const minPriceAvail = pricesAvail
          .filter(x => x.available && typeof x.price === 'number')
          .reduce((acc, x) => acc === null ? x.price : Math.min(acc, x.price), null);

        const minPriceAll = pricesAvail
          .filter(x => typeof x.price === 'number')
          .reduce((acc, x) => acc === null ? x.price : Math.min(acc, x.price), null);

        // Price shown on card: lowest AVAILABLE price if any; else lowest known price; else fall back to base cfg/HTML
        if (priceEl) {
          if (minPriceAvail !== null) priceEl.textContent = euro(minPriceAvail);
          else if (minPriceAll !== null) priceEl.textContent = euro(minPriceAll);
          else {
            // fallback to base
            const baseCfg = cfgOf(article);
            if (baseCfg?.price) priceEl.textContent = euro(baseCfg.price);
          }
        }

        // Sold-out state for the tile: only if ALL variants are unavailable
        const tileSoldOut = !anyAvail;
        el.classList.toggle("sold-out", tileSoldOut);
        if (addBtn) addBtn.disabled = tileSoldOut;

      } else {
        // Non-variant item: original behavior
        const cfg = cfgOf(article);
        if (cfg && priceEl) priceEl.textContent = euro(cfg.price);
        const available = cfg ? cfg.available !== false : true;
        el.classList.toggle("sold-out", !available);
        if (addBtn) addBtn.disabled = !available;
      }
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
      window.ET_LAST_CFG = json; // quick inspection
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

  // 4) Ensure live price/availability is used in modal; block if sold out
  const _origPrepare = window.prepareOptions;
  window.prepareOptions = function (article) {
    // If the tile has variants, we’ll adjust radios after modal renders.
    const hasVariants = article && article.variants && article.variants.type === 'oneOf' && Array.isArray(article.variants.choices);

    // For non-variant items: enforce live price + availability
    if (!hasVariants) {
      try {
        const cfg = cfgOf(article.articleNumber);
        if (cfg) {
          if (cfg.available === false) {
            (window.showNotification || (m => alert(m)))("⚠ This item is currently sold out.");
            return;
          }
          if (typeof cfg.price === 'number') article.price = Number(cfg.price);
        }
      } catch {}
      return _origPrepare.call(this, article);
    }

    // Variant flow:
    try {
      // Precompute live price/availability for each choice
      const base = Number(article.price) || 0;
      article.variants.choices.forEach(c => {
        const vCfg = cfgOf(c.articleNumber);
        c.__liveAvailable = vCfg ? vCfg.available !== false : true;
        // absolute price for this variant
        c.__livePrice = typeof vCfg?.price === 'number'
          ? Number(vCfg.price)
          : (base + Number(c.priceDelta || 0));
      });
    } catch {}

    // Render modal via original function
    _origPrepare.call(this, article);

    // After modal DOM exists, rewrite radios to reflect live availability & absolute prices
    try {
      const inputs = document.querySelectorAll("#optionList input[name='variantOneOf']");
      if (!inputs.length) return;

      let anyAvail = false;
      inputs.forEach((inp, idx) => {
        const choice = article.variants.choices[idx];
        const lbl = inp.parentElement;

        // Disable when sold out
        const available = !!choice.__liveAvailable;
        inp.disabled = !available;
        lbl.style.opacity = available ? "1" : ".5";

        // Replace the label text (after the <input>) with "Label (€X.XX)".
        // Keep the input node intact.
        // Find the first text node after input; if none, append a new one.
        const priceTxt = ` ${choice.label} (${euro(choice.__livePrice).replace('€','€')})` + (available ? '' : ' — Sold out');
        // wipe all text nodes after input, then set one clean node
        const nodes = Array.from(lbl.childNodes);
        nodes.forEach((n,i) => {
          if (n !== inp && n.nodeType === 3) lbl.removeChild(n);
        });
        lbl.appendChild(document.createTextNode(priceTxt));

        if (available) anyAvail = true;
      });

      if (!anyAvail) {
        (window.showNotification || (m => alert(m)))("⚠ All variants are sold out.");
        // Close modal if your page exposes closeModal()
        if (typeof window.closeModal === 'function') window.closeModal();
        return;
      }

      // Make sure the checked radio is available; if not, pick first available
      const checked = document.querySelector("#optionList input[name='variantOneOf']:checked");
      if (checked && checked.disabled) {
        for (const inp of inputs) {
          if (!inp.disabled) { inp.checked = true; break; }
        }
      }
    } catch (e) {
      log("Variant modal patch error:", e);
    }
  };

  // 5) Boot
  document.addEventListener("DOMContentLoaded", () => {
    log("live-config.js loaded. CONFIG_URL:", CONFIG_URL);
    indexItems();
    refreshConfig();
    setInterval(refreshConfig, POLL_MS);
  });
})();
