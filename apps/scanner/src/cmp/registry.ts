// CMP fingerprint registry. Fingerprints are DATA - adding a platform is a row.
export const CMP_REGISTRY_VERSION = "0.1.0";

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
