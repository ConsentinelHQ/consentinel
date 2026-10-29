// Fix guides for consent platforms that "support GPC" while tags keep firing.
// Platform specifics come only from each vendor's own docs (sources). Where a
// vendor doesn't publish details, the guide says so instead of guessing.

export interface Guide {
  slug: string;
  cmp: string;
  /** Search-shaped H1. */
  title: string;
  description: string;
  /** One-paragraph answer up top. */
  short: string;
  /** What the platform itself documents about GPC. */
  documented: string[];
  /** Setup steps, only where the vendor documents them. */
  steps: string[] | null;
  /** Failure modes specific to this platform. */
  specific: { title: string; body: string }[];
  sources: { title: string; url: string }[];
}

/** Why tags fire after GPC on every platform. */
export const COMMON_FAILURES: { title: string; body: string }[] = [
  {
    title: "Pixels hardcoded outside the consent platform",
    body: "A Meta or TikTok pixel pasted into the theme, or injected by a store app, never asks the consent platform for permission. It fires no matter what the banner says.",
  },
  {
    title: "Tag manager tags with no consent condition",
    body: "Google Consent Mode only governs Google's own tags. Meta, TikTok, Pinterest and other tags in Google Tag Manager need their own triggers or consent checks, or they run for everyone.",
  },
  {
    title: "Ad tags filed under the wrong category",
    body: "The opt-out only blocks the categories it's applied to. An advertising pixel sitting in a functional or performance category keeps running after the signal.",
  },
  {
    title: "Tags loading other tags",
    body: "One ad script can pull in several more. The consent platform may gate the first one and never see the rest.",
  },
  {
    title: "Server-side forwarding",
    body: "Conversion APIs and server containers send data from your server, not the browser, so the browser's opt-out never reaches them unless you pass it along.",
  },
];

export const GUIDES: Guide[] = [
  {
    slug: "onetrust-gpc-not-working",
    cmp: "OneTrust",
    title: "OneTrust not honoring Global Privacy Control? Why tags still fire",
    description:
      "OneTrust applies GPC per cookie category, per geolocation rule. Here's where the setting lives, the gaps that let ad tags fire anyway, and how to prove it's fixed.",
    short:
      "OneTrust only applies Global Privacy Control to the cookie categories you tick in each geolocation rule, and only blocks scripts it controls. A rule for another region, an unticked category, or a pixel loaded outside OneTrust lets tags fire after the signal.",
    documented: [
      "GPC is configured per cookie category inside each geolocation rule, then the script is republished.",
      "A GPC-enabled category shows as off by default in the preference center when the signal is present.",
      "Turning on GPC for any category disables the Accept All option in the rule's behaviors.",
      "A visitor's own manual choice overrides GPC: if they opt back in, the category stays on.",
      "An optional opt-out signal notification in the template tells visitors the signal was honored.",
    ],
    steps: [
      "In OneTrust, go to Cookie Consent, then Geolocation Rules, and open the rule group your site uses.",
      "Edit each rule that serves US visitors, expand Cookie categories, and tick Global Privacy Control for every category that holds advertising or sharing tags.",
      "In Cookie Consent, then Templates, open the template, and under Opt-in/opt-out preferences turn on the opt-out signal notification. California requires showing that the signal was processed.",
      "Save and publish the script, then test with a browser that sends GPC.",
    ],
    specific: [
      {
        title: "GPC ticked in one rule, not the others",
        body: "If California has its own rule and the rest of the US falls into a default rule, visitors from Colorado, Texas or New Jersey may get no GPC handling at all.",
      },
      {
        title: "Scripts OneTrust doesn't block",
        body: "OneTrust can only hold back scripts it controls, through auto-blocking or by tagging them with its category classes. A pixel added straight to the page outside that setup isn't gated.",
      },
      {
        title: "Changes saved but not published",
        body: "Geolocation rule and template edits don't reach your site until the script is published again.",
      },
    ],
    sources: [
      {
        title: "OneTrust: Global Privacy Control in geolocation rules",
        url: "https://my.onetrust.com/articles/en_US/Knowledge/UUID-7c78b8b2-8399-d284-b9e9-fe4ec44e8aed",
      },
    ],
  },
  {
    slug: "cookiebot-gpc-not-working",
    cmp: "Cookiebot",
    title: "Cookiebot and Global Privacy Control: why trackers fire after the signal",
    description:
      "Cookiebot only changes consent for GPC on certain banner types. On every other setup the signal does nothing. Here's how to check yours and close the gaps.",
    short:
      "Cookiebot's own documentation says GPC only changes consent on a few banner setups. On every other setup, the signal has no effect on Cookiebot's consent at all. Even when it does apply, tags Cookiebot doesn't block keep firing.",
    documented: [
      "Decline Only banners: implied consent from scrolling or clicking becomes an opt-out instead of an opt-in.",
      "Do Not Sell banners with no banner shown: the signal triggers a full opt-out.",
      "Do Not Sell banners with the banner shown: the Do not sell checkbox comes pre-checked.",
      "Multilevel and Inline Multilevel banners: options that were pre-checked are unchecked.",
      "Every other banner setup: Cookiebot says the GPC signal has no impact on consent or the banner.",
      "Cookiebot honors GPC only, not Do Not Track.",
    ],
    steps: [
      "Check which banner type your Cookiebot domain group uses for US visitors.",
      "If it isn't one of the types above, GPC isn't changing anything. Switch US visitors to a type that responds to the signal.",
      "Make sure every advertising tag is blocked by Cookiebot, through automatic blocking or its manual markup, and categorized as marketing.",
      "Test with a browser that sends GPC and confirm marketing tags don't load.",
    ],
    specific: [
      {
        title: "A banner type that ignores GPC",
        body: "This is the big one. A standard opt-in banner shown to US visitors doesn't change consent when the signal arrives, so whatever your US default is stays in place.",
      },
      {
        title: "Tags outside automatic blocking",
        body: "Cookiebot can only hold back scripts it recognizes or that you've marked up for it. Pixels injected by apps or loaded late can slip past.",
      },
    ],
    sources: [
      {
        title: "Cookiebot: Cookiebot and the GPC signal",
        url: "https://support.cookiebot.com/hc/en-us/articles/8470146709532-Cookiebot-and-the-GPC-signal",
      },
    ],
  },
  {
    slug: "osano-gpc-not-working",
    cmp: "Osano",
    title: "Osano and Global Privacy Control: is the toggle on, and is it enough?",
    description:
      "Osano honors GPC through an optional toggle that only takes effect after you republish. Here's what it covers, what it doesn't, and how to verify tags actually stop.",
    short:
      "In Osano, honoring Global Privacy Control is an optional toggle in the Consent Manager, and it only takes effect after you republish. Osano frames the signal as an opt-out of sale, so tags have to be in the right categories, and under Osano's control, for it to stop them.",
    documented: [
      "GPC handling is a toggle in the Consent Manager. It's optional, and Osano strongly recommends turning it on.",
      "The change applies only after you republish your configuration.",
      "Osano treats the signal as an opt-out of the sale of personal information.",
    ],
    steps: [
      "In Osano's Consent Manager, turn on the Global Privacy Control toggle.",
      "Republish the configuration.",
      "Check that every advertising and sharing tag is classified so the sale opt-out blocks it.",
      "Test with a browser that sends GPC.",
    ],
    specific: [
      {
        title: "Toggle off, or never republished",
        body: "Because it's optional, the setting is easy to miss, and flipping it without republishing changes nothing on the live site.",
      },
      {
        title: "Ad tags not treated as sale or sharing",
        body: "If a pixel is classified somewhere the sale opt-out doesn't reach, it keeps firing for visitors who sent the signal.",
      },
    ],
    sources: [
      {
        title: "Osano: Global Privacy Control enabled reporting",
        url: "https://osano.com/updates/global-privacy-control-enabled",
      },
    ],
  },
  {
    slug: "didomi-gpc-not-working",
    cmp: "Didomi",
    title: "Didomi and Global Privacy Control: why some tags still fire",
    description:
      "Didomi says it detects GPC automatically and shows an Opt-Out Request Honored message. Tags it doesn't control can still fire. Here's how to find them.",
    short:
      "Didomi says it detects Global Privacy Control automatically, stops data sharing and targeted advertising, and shows an Opt-Out Request Honored message. That only reaches tags and vendors wired through Didomi. Anything loaded around it keeps running.",
    documented: [
      "Didomi says it reads the GPC signal in real time with no custom code.",
      "When the signal is present, Didomi says sharing and targeted advertising stop.",
      "It can show an Opt-Out Request Honored message, which California requires from 2026.",
      "Didomi lists obligations that stay with the site, including making sure downstream recipients honor the opt-out and monitoring it continuously.",
    ],
    steps: null,
    specific: [
      {
        title: "Tags that don't wait for Didomi",
        body: "Pixels added directly to the page, or tag manager tags that don't check Didomi's consent state, run before or regardless of it.",
      },
      {
        title: "Vendors missing from the vendor list",
        body: "Didomi can only withhold consent from vendors it knows about. A new ad partner added without updating the notice isn't covered.",
      },
    ],
    sources: [
      {
        title: "Didomi: Global Privacy Control compliance",
        url: "https://www.didomi.io/regulations/gpc-compliance",
      },
    ],
  },
  {
    slug: "trustarc-gpc-not-working",
    cmp: "TrustArc",
    title: "TrustArc and Global Privacy Control: check your tier and your tags",
    description:
      "TrustArc's Cookie Consent Manager detects GPC, and TrustArc lists it as an Advanced feature. Here's what to confirm with TrustArc and how to verify tags stop.",
    short:
      "TrustArc's Cookie Consent Manager detects Global Privacy Control, and TrustArc lists it as part of CCM Advanced. TrustArc doesn't publish category-level detail, so confirm your tier and setup with them, then test the live site.",
    documented: [
      "TrustArc's Cookie Consent Manager auto-detects the GPC signal from browsers and extensions.",
      "TrustArc lists GPC functionality as part of CCM Advanced.",
      "Some related features, like remembering known users' choices, are configured by TrustArc's team rather than self-serve.",
    ],
    steps: null,
    specific: [
      {
        title: "GPC not included in your plan",
        body: "If your account isn't on a tier with GPC handling, the banner can look compliant while the signal is never processed.",
      },
      {
        title: "Category behavior never confirmed",
        body: "Ask TrustArc which categories the signal opts out of, then check that every ad tag sits in one of them.",
      },
    ],
    sources: [
      {
        title: "TrustArc: Global Privacy Control",
        url: "https://trustarc.com/resource/global-privacy-control/",
      },
      {
        title: "TrustArc: GPC and known user consent",
        url: "https://trustarc.com/resource/global-privacy-control-known-user-consent/",
      },
    ],
  },
];

/** The fix guide for a detected consent platform, by its display name. */
export const guideForCmp = (name: string | null | undefined): Guide | undefined =>
  name ? GUIDES.find((g) => g.cmp.toLowerCase() === name.toLowerCase()) : undefined;
