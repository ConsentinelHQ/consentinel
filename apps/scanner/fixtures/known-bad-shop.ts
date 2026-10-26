import http from "node:http";
import type { AddressInfo } from "node:net";

// A simulated mid-market shop wearing a real OneTrust banner. GROUND TRUTH:
//   Under REJECT (and by default): GA4 (gcs=G100 + email leak), gtag.js, and Meta Pixel
//   all fire -> violations. Cookies _ga/_fbp set pre-consent -> warnings.
//   Under ACCEPT: TikTok pixel fires -> legitimate, must be "correctlyGated", not flagged.
//   Under GPC with no click: Pinterest respects the reject button but not the signal
//   -> gpc-signal-ignored. Criteo honors both -> stoppedBy. The page confirms the
//   signal with "Opt-Out Request Honored".
//   Disclosure: the privacy policy names Google, Facebook, Pinterest and Criteo,
//   so TikTok, Microsoft Clarity and Reddit run without being named.
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Northvale Outfitters</title></head>
<body>
  <h1>Northvale Outfitters - Checkout</h1>
  <footer><a href="/pages/privacy-policy">Privacy Policy</a> <a href="/pages/your-privacy-choices">Your Privacy Choices</a></footer>

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

    // CCPA-model sale tags: run by default, stop on a reject click. Pinterest
    // never reads the signal; Criteo does.
    var rejected = false;
    var gpcOn = navigator.globalPrivacyControl === true;
    setTimeout(function () {
      if (rejected) return;
      new Image().src = 'https://ct.pinterest.com/v3/?tid=2612345678&event=init';
      if (!gpcOn) new Image().src = 'https://sslwidget.criteo.com/event?a=12345&v=5';
    }, 2000);
    if (gpcOn) {
      var ack = document.createElement('p');
      ack.textContent = 'Opt-Out Request Honored';
      document.body.appendChild(ack);
    }

    // Fires ONLY after Accept (the legitimate, gated path):
    document.getElementById('onetrust-accept-btn-handler').addEventListener('click', function () {
      new Image().src = 'https://www.redditstatic.com/ads/pixel.js';
      new Image().src = 'https://www.google-analytics.com/g/collect?v=2&tid=G-NV12345XYZ&gcs=G111&en=consent_granted';
    });
    // Reject simply closes the banner; nothing new fires.
    document.getElementById('onetrust-reject-all-handler').addEventListener('click', function () {
      rejected = true;
      document.getElementById('onetrust-banner-sdk').style.display = 'none';
    });
  </script>
</body></html>`;

const POLICY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Privacy Policy</title></head>
<body><h1>Privacy Policy</h1>
<p>This Privacy Policy describes how Northvale Outfitters collects, uses and shares your personal information
when you visit our store. We collect device information using cookies, log files, web beacons and pixels.</p>
<p>We share your personal information with service providers. We use Google Analytics to understand how
customers use the store, and we use Facebook and Pinterest for advertising. Criteo helps us show relevant ads.</p>
<p>You can opt out of targeted advertising through the links below. We respond to Global Privacy Control
signals as a request to opt out of sale or sharing. Contact us at privacy@example.com with any questions
about this policy or your rights under applicable law, including the right to access, correct or delete
personal information we hold about you.</p>
<p>We keep order information for our records unless and until you ask us to delete it. Our store is not intended for children under 16.</p></body></html>`;

export interface FixtureHandle {
  server: http.Server;
  url: string;
}

export function startFixtureServer(port = 0): Promise<FixtureHandle> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(req.url?.startsWith("/pages/privacy-policy") ? POLICY : PAGE);
    });
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${p}/` });
    });
  });
}
