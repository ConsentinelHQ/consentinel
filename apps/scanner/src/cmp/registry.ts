// CMP fingerprint registry. Fingerprints are DATA - adding a platform is a row.
export const CMP_REGISTRY_VERSION = "0.2.0";

export interface CmpDefinition {
  id: string;
  name: string;
  globals: string[];
  selectors: string[];
  cookies: string[];
  scriptHosts: string[];
  accept: string[];
  reject: string[];
}

export const CMPS: CmpDefinition[] = [
  /**
   * Platforms found in a 20-site batch run. Only 1 of 16 successful scans got a
   * reject click, because the mid-market does not run the five enterprise CMPs -
   * it runs Shopify's native API and a long tail of app-store plugins.
   *
   * Without these, findings are graded "observed before any choice was made"
   * rather than "we clicked reject and they fired anyway", which is a materially
   * weaker claim to put in front of a buyer.
   */
  {
    id: "shopify-native",
    name: "Shopify Consent",
    globals: ["Shopify"],
    selectors: [".shopify-pc__banner", "#shopify-pc__banner", "[data-shopify-privacy-banner]"],
    cookies: ["_tracking_consent"],
    scriptHosts: ["cdn.shopify.com/shopifycloud/privacy-banner"],
    accept: [".shopify-pc__banner__btn-accept", "button[data-shopify-privacy-accept]"],
    reject: [".shopify-pc__banner__btn-decline", "button[data-shopify-privacy-decline]"],
  },
  {
    id: "cookieyes",
    name: "CookieYes",
    globals: ["CookieYes", "cookieyes"],
    selectors: [".cky-consent-container", ".cky-modal", "#cookieyes"],
    cookies: ["cookieyes-consent"],
    scriptHosts: ["cdn-cookieyes.com", "app.cookieyes.com"],
    accept: [".cky-btn-accept", "[data-cky-tag='accept-button']"],
    reject: [".cky-btn-reject", "[data-cky-tag='reject-button']"],
  },
  {
    id: "pandectes",
    name: "Pandectes",
    globals: ["Pandectes"],
    selectors: ["#pandectes-banner", ".pandectes-banner"],
    cookies: ["_pandectes_gdpr"],
    scriptHosts: ["pandectes.io", "cdn.pandectes.io"],
    accept: ["#pandectes-btn-accept", ".pandectes-accept-all"],
    reject: ["#pandectes-btn-reject", ".pandectes-reject-all"],
  },
  {
    id: "ketch",
    name: "Ketch",
    globals: ["ketch", "semaphore"],
    selectors: ["#lanyard_root", ".ketch-banner"],
    cookies: ["_ketch_consent_v1_"],
    scriptHosts: ["global.ketchcdn.com", "cdn.ketchjs.com"],
    accept: ["#ketch-banner-button-primary", "[data-testid='banner-accept']"],
    reject: ["#ketch-banner-button-secondary", "[data-testid='banner-reject']"],
  },
  {
    id: "datagrail",
    name: "DataGrail",
    globals: ["DG", "datagrail"],
    selectors: ["#dg-consent-banner", ".dg-cookie-consent"],
    cookies: ["datagrail_consent_id"],
    scriptHosts: ["datagrail.io", "cdn.datagrail.io"],
    accept: ["#dg-accept-all", ".dg-banner-accept"],
    reject: ["#dg-reject-all", ".dg-banner-reject"],
  },
  {
    id: "termly",
    name: "Termly",
    globals: ["Termly"],
    selectors: ["#termly-code-snippet-support", ".termly-styles-banner"],
    cookies: ["TERMLY_API_CACHE"],
    scriptHosts: ["app.termly.io"],
    accept: ["[data-tid='banner-accept']", ".t-acceptAllButton"],
    reject: ["[data-tid='banner-decline']", ".t-declineAllButton"],
  },
  {
    id: "iubenda",
    name: "Iubenda",
    globals: ["_iub"],
    selectors: ["#iubenda-cs-banner", ".iubenda-cs-container"],
    cookies: ["_iub_cs-"],
    scriptHosts: ["cdn.iubenda.com", "cs.iubenda.com"],
    accept: [".iubenda-cs-accept-btn", "#iubenda-cs-accept-btn"],
    reject: [".iubenda-cs-reject-btn", "#iubenda-cs-reject-btn"],
  },
  {
    id: "usercentrics",
    name: "Usercentrics",
    globals: ["UC_UI", "usercentrics"],
    selectors: ["#usercentrics-root", "#uc-center-container"],
    cookies: ["ucData"],
    scriptHosts: ["app.usercentrics.eu", "web.cmp.usercentrics.eu"],
    accept: ["[data-testid='uc-accept-all-button']", "#uc-btn-accept-banner"],
    reject: ["[data-testid='uc-deny-all-button']", "#uc-btn-deny-banner"],
  },
  {
    id: "quantcast",
    name: "Quantcast Choice",
    globals: ["__tcfapi", "__cmp"],
    selectors: [".qc-cmp2-container", "#qc-cmp2-ui"],
    cookies: ["euconsent-v2"],
    scriptHosts: ["quantcast.mgr.consensu.org", "cmp.quantcast.com"],
    // Scoped to the CMP container: bare [mode=...] matches unrelated page elements.
    accept: [
      ".qc-cmp2-summary-buttons button[mode='primary']",
      "#qc-cmp2-ui button[mode='primary']",
    ],
    reject: [
      ".qc-cmp2-summary-buttons button[mode='secondary']",
      "#qc-cmp2-ui button[mode='secondary']",
    ],
  },
  {
    id: "klaro",
    name: "Klaro",
    globals: ["klaro"],
    selectors: [".klaro .cookie-notice", "#klaro"],
    cookies: ["klaro"],
    scriptHosts: ["kiprotect.com"],
    accept: [".cn-buttons .cm-btn-success", ".cookie-notice .cm-btn-accept-all"],
    reject: [".cn-buttons .cm-btn-decline", ".cookie-notice .cm-btn-decline"],
  },

  {
    id: "onetrust",
    name: "OneTrust",
    globals: ["OneTrust", "OptanonWrapper", "Optanon"],
    selectors: ["#onetrust-banner-sdk", "#onetrust-consent-sdk"],
    cookies: ["OptanonConsent", "OptanonAlertBoxClosed"],
    scriptHosts: ["cdn.cookielaw.org", "onetrust.com", "geolocation.onetrust.com"],
    accept: ["#onetrust-accept-btn-handler", "#accept-recommended-btn-handler"],
    reject: ["#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler"],
  },
  {
    id: "cookiebot",
    name: "Cookiebot",
    globals: ["Cookiebot", "CookieConsent"],
    selectors: ["#CybotCookiebotDialog", "#CybotCookiebotDialogBody"],
    cookies: ["CookieConsent"],
    scriptHosts: ["consent.cookiebot.com", "consentcdn.cookiebot.com"],
    accept: [
      "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
      "#CybotCookiebotDialogBodyButtonAccept",
      "#CybotCookiebotDialogBodyLevelButtonAccept",
    ],
    reject: [
      "#CybotCookiebotDialogBodyButtonDecline",
      "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
    ],
  },
  {
    id: "osano",
    name: "Osano",
    globals: ["Osano"],
    selectors: [".osano-cm-window", ".osano-cm-dialog"],
    cookies: [],
    scriptHosts: ["cmp.osano.com"],
    accept: [".osano-cm-accept-all", ".osano-cm-accept"],
    reject: [".osano-cm-denyAll", ".osano-cm-deny"],
  },
  {
    id: "didomi",
    name: "Didomi",
    globals: ["Didomi", "didomiState"],
    selectors: ["#didomi-host", ".didomi-popup-container"],
    cookies: ["didomi_token", "euconsent-v2"],
    scriptHosts: ["sdk.privacy-center.org", "api.privacy-center.org"],
    accept: ["#didomi-notice-agree-button", ".didomi-components-button--agree"],
    reject: ["#didomi-notice-disagree-button", ".didomi-components-button--disagree"],
  },
  {
    id: "trustarc",
    name: "TrustArc",
    globals: ["truste"],
    selectors: ["#truste-consent-track", ".truste_overlay"],
    cookies: ["notice_behavior", "notice_gdpr_prefs"],
    scriptHosts: ["consent.trustarc.com", "choices.trustarc.com"],
    accept: ["#truste-consent-button"],
    reject: ["#truste-consent-required"],
  },
];
