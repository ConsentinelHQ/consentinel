import http from "node:http";
import type { AddressInfo } from "node:net";

// A simulated mid-market shop wearing a real OneTrust banner. GROUND TRUTH:
//   Under REJECT (and by default): GA4 (gcs=G100 + email leak), gtag.js, and Meta Pixel
//   all fire -> violations. Cookies _ga/_fbp set pre-consent -> warnings.
//   Under ACCEPT: TikTok pixel fires -> legitimate, must be "correctlyGated", not flagged.
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Northvale Outfitters</title></head>
<body>
  <h1>Northvale Outfitters - Checkout</h1>

  <!-- OneTrust-style banner with real handler IDs -->
  <div id="onetrust-banner-sdk">
    <button id="onetrust-accept-btn-handler">Accept All</button>
    <button id="onetrust-reject-all-handler">Reject All</button>
  </div>

  <script>
    window.OneTrust = { fixture: true };

    // Fires immediately, regardless of consent (the violations):
    var s = document.createElement('script');
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-NV12345XYZ';
    document.head.appendChild(s);

    new Image().src = 'https://www.google-analytics.com/g/collect?v=2&tid=G-NV12345XYZ'
      + '&gcs=G100&en=page_view&ep.email=jane.doe@gmail.com';

    var m = document.createElement('script');
    m.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(m);
    new Image().src = 'https://www.facebook.com/tr?id=998877665544&ev=PageView';

    document.cookie = '_ga=GA1.2.1234567890.1700000000; path=/';
    document.cookie = '_fbp=fb.1.1700000000.987654321; path=/';
    // An embedded video's cookies. A real violation most sites never notice.
    document.cookie = 'VISITOR_INFO1_LIVE=abc123; path=/';
    document.cookie = 'YSC=xyz789; path=/';
    // Strictly necessary - must NOT be flagged.
    document.cookie = 'OptanonConsent=groups=C0001:1; path=/';

    // A tag that only fires once the page settles, like a real GTM measurement hit.
    setTimeout(function () {
      new Image().src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=LATE';
      new Image().src = 'https://www.clarity.ms/tag/late123';
    }, 1200);

    // Fires ONLY after Accept (the legitimate, gated path):
    document.getElementById('onetrust-accept-btn-handler').addEventListener('click', function () {
      new Image().src = 'https://www.redditstatic.com/ads/pixel.js';
      new Image().src = 'https://www.google-analytics.com/g/collect?v=2&tid=G-NV12345XYZ&gcs=G111&en=consent_granted';
    });
    // Reject simply closes the banner; nothing new fires.
    document.getElementById('onetrust-reject-all-handler').addEventListener('click', function () {
      document.getElementById('onetrust-banner-sdk').style.display = 'none';
    });
  </script>
</body></html>`;

export interface FixtureHandle {
  server: http.Server;
  url: string;
}

export function startFixtureServer(port = 0): Promise<FixtureHandle> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    });
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${p}/` });
    });
  });
}
