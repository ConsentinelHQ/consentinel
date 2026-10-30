import { frameAncestors, shopifyConfig } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The embedded app home inside Shopify admin. Served as plain HTML rather than a
 * Next page: App Bridge must be the first script in <head>, and the marketing
 * layout (nav, footer, Clerk) has no place in the admin iframe.
 *
 * Every value from the API is written with textContent, never innerHTML. Vendor
 * names come from third-party scripts on the merchant's store.
 */
export function GET(request: Request): Response {
  const config = shopifyConfig();
  if (!config) return new Response("Not found", { status: 404 });
  const shop = new URL(request.url).searchParams.get("shop");
  return new Response(page(config.apiKey), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": frameAncestors(shop),
    },
  });
}

function attr(value: string): string {
  return value.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}

const LOGO = `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(14 14) scale(0.72)"><path d="M76.05 28.14 A34 34 0 1 0 76.05 71.86" fill="none" stroke="currentColor" stroke-width="16"/><rect x="85" y="31" width="12" height="38" rx="2" fill="currentColor"/><circle class="dot" cx="50" cy="50" r="10" fill="currentColor"/></g></svg>`;

function page(apiKey: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="shopify-api-key" content="${attr(apiKey)}">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consentinel</title>
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
  <header class="top">
    <div class="brand">${LOGO}<div><strong>Consentinel</strong><span id="site">Loading your store</span></div></div>
    <span id="plan" class="pill">Free scan</span>
  </header>

  <section class="card" id="scan-card">
    <div id="scanning" class="state">
      <p class="eyebrow">Scanning your storefront</p>
      <h1>Checking what runs after a visitor says no</h1>
      <div class="bar"><span></span></div>
      <ol class="steps">
        <li>Reject all cookies</li>
        <li>Accept all cookies</li>
        <li>Global Privacy Control on</li>
      </ol>
      <p class="muted">This takes about a minute. You can leave this page open.</p>
    </div>

    <div id="result" class="state" hidden>
      <p class="eyebrow" id="scanned-at"></p>
      <h1 id="headline"></h1>
      <div class="tiles">
        <div class="tile critical"><b id="n-critical">0</b><span>Critical</span></div>
        <div class="tile warning"><b id="n-warning">0</b><span>Warnings</span></div>
        <div class="tile"><b id="n-info">0</b><span>Info</span></div>
      </div>
      <p class="muted" id="cmp"></p>
      <ul class="findings" id="findings"></ul>
      <div class="actions">
        <a class="btn primary" id="report" target="_blank" rel="noopener">Open full report</a>
        <button class="btn" id="rescan" type="button">Scan again</button>
      </div>
    </div>

    <div id="failed" class="state" hidden>
      <p class="eyebrow">Scan didn't finish</p>
      <h1 id="fail-title">We couldn't scan your storefront</h1>
      <p class="muted" id="fail-detail"></p>
      <div class="actions"><button class="btn primary" id="retry" type="button">Try again</button></div>
    </div>
  </section>

  <section class="card monitor" id="monitor-off" hidden>
    <div>
      <p class="eyebrow">Daily monitoring</p>
      <h2>Know the day a tracker starts leaking</h2>
      <p class="muted">Apps, theme edits and tag changes can break your opt-out overnight. We rescan your store every day and email you when an ad vendor starts firing after a visitor opts out. Every scan is kept as dated evidence.</p>
      <ul class="ticks">
        <li>Daily reject, accept and GPC tests</li>
        <li>Email alerts on new violations</li>
        <li>30 days of sealed scan history</li>
      </ul>
    </div>
    <div class="price">
      <b>$99</b><span>per month</span>
      <button class="btn primary" id="subscribe" type="button">Start free trial</button>
      <small id="trial-note">7 days free. Cancel any time.</small>
    </div>
  </section>

  <section class="card monitor on" id="monitor-on" hidden>
    <div>
      <p class="eyebrow">Monitoring is on</p>
      <h2>We're watching your store every day</h2>
      <p class="muted">Alerts go to your store email. Each daily scan is sealed and kept for 30 days.</p>
    </div>
    <span class="live"><i></i>Live</span>
  </section>

  <p class="foot">Plaintiffs' firms are suing retailers under California's wiretap law when trackers fire after an opt-out. <a href="https://www.getconsentinel.com/gpc" target="_blank" rel="noopener">How the risk works</a></p>
</main>
<script>${JS}</script>
</body>
</html>`;
}

const CSS = `
:root{--ink:#1d1d1f;--soft:#6e6e73;--line:#e5e5ea;--alt:#f5f5f7;--crit:#d70015;--warn:#b25000;--ok:#00795c;--ease:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:880px;margin:0 auto;padding:28px 20px 48px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.brand{display:flex;align-items:center;gap:12px}
.brand svg{width:36px;height:36px;color:var(--ink)}
.brand .dot{transform-origin:50px 50px;animation:pulse 2.4s var(--ease) infinite}
.brand strong{display:block;font-size:16px}
.brand span{color:var(--soft);font-size:13px}
.pill{font-size:12px;font-weight:600;padding:5px 10px;border-radius:999px;background:var(--alt);color:var(--soft)}
.pill.on{background:#e5f4e4;color:var(--ok)}
.card{border:1px solid var(--line);border-radius:16px;padding:28px;margin-bottom:16px;background:#fff;animation:rise .6s var(--ease) both}
.state{animation:fade .4s var(--ease) both}
.eyebrow{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--soft)}
h1{margin:0 0 16px;font-size:24px;line-height:1.25;letter-spacing:-.01em}
h2{margin:0 0 8px;font-size:19px}
.muted{color:var(--soft);margin:0 0 12px}
.bar{height:6px;border-radius:6px;background:var(--alt);overflow:hidden;margin:6px 0 18px}
.bar span{display:block;height:100%;width:40%;border-radius:6px;background:var(--ink);animation:slide 1.6s var(--ease) infinite}
.steps{list-style:none;padding:0;margin:0 0 16px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.steps li{font-size:13px;padding:10px 12px;border-radius:10px;background:var(--alt);color:var(--soft);transition:all .4s var(--ease)}
.steps li.active{background:var(--ink);color:#fff}
.steps li.done{background:#e5f4e4;color:var(--ok)}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.tile{padding:14px;border-radius:12px;background:var(--alt)}
.tile b{display:block;font-size:28px;line-height:1.1}
.tile span{font-size:12px;color:var(--soft)}
.tile.critical b{color:var(--crit)}
.tile.warning b{color:var(--warn)}
.tile b.zero{color:var(--soft)}
.findings{list-style:none;padding:0;margin:0 0 18px;border-top:1px solid var(--line)}
.findings li{display:flex;gap:12px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--line);animation:fade .4s var(--ease) both}
.findings i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--warn);transform:translateY(-1px)}
.findings i.critical{background:var(--crit)}
.findings b{font-weight:600;min-width:9rem}
.findings span{color:var(--soft)}
.findings li.clean{color:var(--ok)}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit;font-weight:600;padding:10px 16px;border-radius:10px;cursor:pointer;text-decoration:none;transition:transform .2s var(--ease),background .2s}
.btn:hover{background:var(--alt)}
.btn:active{transform:scale(.98)}
.btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.btn.primary:hover{background:#3a3a3c}
.btn[disabled]{opacity:.5;cursor:default}
.monitor{display:flex;gap:28px;align-items:center;justify-content:space-between}
.ticks{list-style:none;padding:0;margin:0}
.ticks li{padding-left:22px;position:relative;margin:4px 0;font-size:14px}
.ticks li:before{content:"";position:absolute;left:2px;top:6px;width:10px;height:6px;border-left:2px solid var(--ok);border-bottom:2px solid var(--ok);transform:rotate(-45deg)}
.price{flex:none;text-align:center;padding:20px 24px;border-radius:14px;background:var(--alt);min-width:200px}
.price b{display:block;font-size:34px;line-height:1}
.price span{display:block;color:var(--soft);font-size:13px;margin-bottom:14px}
.price .btn{width:100%}
.price small{display:block;margin-top:8px;color:var(--soft);font-size:12px}
.live{display:flex;align-items:center;gap:8px;font-weight:600;color:var(--ok)}
.live i{width:10px;height:10px;border-radius:50%;background:var(--ok);animation:ping 1.8s var(--ease) infinite}
.foot{color:var(--soft);font-size:13px;text-align:center;margin-top:20px}
.foot a{color:var(--ink)}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(.8)}}
@keyframes ping{0%{box-shadow:0 0 0 0 rgba(0,121,92,.45)}100%{box-shadow:0 0 0 10px rgba(0,121,92,0)}}
@media (max-width:640px){.monitor{flex-direction:column;align-items:stretch}.steps{grid-template-columns:1fr}.findings b{min-width:6rem}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const JS = `
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var pollTimer = null, stepTimer = null;

  async function token(){ return await window.shopify.idToken(); }

  async function api(path, method){
    var res = await fetch(path, { method: method || "GET", headers: { Authorization: "Bearer " + (await token()) } });
    var body = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error((body.error || "Something went wrong.") + (body.detail ? " " + body.detail : ""));
    return body;
  }

  function toast(msg, isError){ try { window.shopify.toast.show(msg, { isError: !!isError }); } catch(e) {} }

  function show(id){
    ["scanning","result","failed"].forEach(function(s){ $(s).hidden = s !== id; });
  }

  function animateSteps(){
    if (stepTimer) return;
    var items = document.querySelectorAll(".steps li"), i = 0;
    function tick(){
      items.forEach(function(li, n){ li.className = n < i ? "done" : n === i ? "active" : ""; });
      i = (i + 1) % (items.length + 1);
    }
    tick(); stepTimer = setInterval(tick, 6000);
  }

  function render(state){
    $("site").textContent = state.siteUrl ? state.siteUrl.replace(/^https?:\\/\\//, "") : state.shop;
    $("plan").textContent = state.monitoring ? "Monitoring on" : "Free scan";
    $("plan").className = "pill" + (state.monitoring ? " on" : "");
    $("monitor-off").hidden = state.monitoring;
    $("monitor-on").hidden = !state.monitoring;

    var scan = state.scan;
    if (!scan || scan.status === "queued" || scan.status === "running") {
      show("scanning"); animateSteps(); schedule(); return;
    }
    clearInterval(stepTimer); stepTimer = null;
    if (scan.status === "failed") {
      show("failed");
      var locked = scan.passwordProtected;
      $("fail-title").textContent = locked ? "Your store is password protected"
        : scan.blockedBy ? "Your bot protection blocked the scan" : "We couldn't scan your storefront";
      $("fail-detail").textContent = locked
        ? "We can only test what shoppers see. Turn off the storefront password in Online Store > Preferences, then scan again."
        : scan.blockedBy
          ? scan.blockedBy.charAt(0).toUpperCase() + scan.blockedBy.slice(1) + " refused our scanner. Allow it in your bot protection settings, then try again."
          : (scan.error || "Try again in a minute.");
      return;
    }
    show("result");
    $("scanned-at").textContent = scan.scannedAt ? "Scanned " + new Date(scan.scannedAt).toLocaleString() : "Latest scan";
    $("headline").textContent = scan.headline || "Scan complete";
    ["critical","warning","info"].forEach(function(k){
      var n = scan.counts ? scan.counts[k] : 0;
      $("n-" + k).textContent = n; $("n-" + k).className = n === 0 ? "zero" : "";
    });
    $("cmp").textContent = scan.cmpName ? "Consent banner: " + scan.cmpName : "No consent banner detected";
    var list = $("findings"); list.textContent = "";
    if (scan.findings.length === 0) {
      var ok = document.createElement("li"); ok.className = "clean";
      ok.textContent = state.monitoring
        ? "Every ad vendor stopped when the visitor opted out."
        : "Every ad vendor stopped when the visitor opted out. Turn on monitoring to keep it that way.";
      list.appendChild(ok);
    }
    scan.findings.forEach(function(f, n){
      var li = document.createElement("li"); li.style.animationDelay = (n * 60) + "ms";
      var dot = document.createElement("i"); dot.className = f.severity;
      var b = document.createElement("b"); b.textContent = f.vendor;
      var s = document.createElement("span"); s.textContent = f.title;
      li.appendChild(dot); li.appendChild(b); li.appendChild(s); list.appendChild(li);
    });
    if (scan.reportUrl) { $("report").href = scan.reportUrl; $("report").hidden = false; } else { $("report").hidden = true; }
  }

  function schedule(){ clearTimeout(pollTimer); pollTimer = setTimeout(load, 4000); }

  async function load(){
    try { render(await api("/api/shopify/session")); }
    catch (e) { toast(e.message, true); schedule(); }
  }

  async function rescan(btn){
    btn.disabled = true;
    try { await api("/api/shopify/scan", "POST"); show("scanning"); animateSteps(); schedule(); }
    catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; }
  }

  $("rescan").addEventListener("click", function(){ rescan(this); });
  $("retry").addEventListener("click", function(){ rescan(this); });
  $("subscribe").addEventListener("click", async function(){
    var btn = this; btn.disabled = true;
    try {
      var r = await api("/api/shopify/billing", "POST");
      window.open(r.confirmationUrl, "_top");
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  });

  load();
})();
`;
