// Accessibility fix guides. Plain fixes for the issues automated checks find
// most on online stores. Facts about third parties come only from the sources.

export interface A11yGuide {
  slug: string;
  /** Search-shaped H1. */
  title: string;
  description: string;
  eyebrow: string;
  /** One-paragraph answer up top. */
  short: string;
  sections: { title: string; body: string[] }[];
  faq: { q: string; a: string }[];
  sources?: { title: string; url: string }[];
}

export const A11Y_GUIDES: A11yGuide[] = [
  {
    slug: "missing-alt-text",
    eyebrow: "Accessibility fix guide",
    title: "How to fix missing alt text on your store",
    description:
      "Why images without alt text are the most common accessibility failure on online stores, how to write it for product photos, and how to fix it in Shopify.",
    short:
      "Alt text is the short description a screen reader reads out instead of an image. Product photos, logos and image buttons without it announce as just “image” or the file name, so a blind shopper can't tell what they're looking at or what a button does. It's the issue automated checks find most, and usually the quickest to fix.",
    sections: [
      {
        title: "What to write",
        body: [
          "Describe what a shopper would need to know: the product, its color or variant, and anything that matters for the choice. “Navy merino crew sock, side view” beats “sock” or “IMG_2041”.",
          "Image buttons and linked logos describe the action, not the picture: “Search”, “Cart”, “Home”.",
          'Purely decorative images (background textures, dividers) get empty alt text, alt="", so screen readers skip them. Empty is not the same as missing.',
        ],
      },
      {
        title: "Fixing it in Shopify",
        body: [
          "Product images: in the admin, open the product, click the image and add the alt text in the media editor.",
          "Theme images (banners, collection tiles): most themes have an alt text field next to each image in the theme editor. If yours doesn't, the theme's image tag is missing the alt attribute and the fix is in the theme code.",
          "Icons in the header (search, account, cart) are usually in the theme code. Each icon-only link or button needs an aria-label or visually hidden text.",
        ],
      },
      {
        title: "Keep it fixed",
        body: [
          "Missing alt text comes back every time someone uploads a product or a new banner without it. Rescanning after releases catches it before a shopper does.",
        ],
      },
    ],
    faq: [
      {
        q: "Does every image need alt text?",
        a: 'Every image needs an alt attribute. Meaningful images get a description; decorative ones get an empty one (alt="") so screen readers skip them.',
      },
      {
        q: "Can I generate alt text automatically?",
        a: "Generated text is a starting point, not a fix. It often misses what matters for a purchase, like the variant or what an image button does. Review it.",
      },
      {
        q: "How do I find every image missing alt text?",
        a: "Run a free scan. It lists each image without alt text, the page it's on and the element, so you can fix them in one pass.",
      },
    ],
  },
  {
    slug: "low-color-contrast",
    eyebrow: "Accessibility fix guide",
    title: "How to fix low color contrast on your website",
    description:
      "What WCAG's 4.5:1 contrast ratio means, where online stores usually fail it (sale badges, light gray text, text on images), and how to fix it.",
    short:
      "WCAG AA asks for a contrast ratio of at least 4.5:1 between text and its background, or 3:1 for large text. Light gray body copy, pastel sale badges and white text on photos are where stores fail it most. Low contrast makes text hard to read for people with low vision and for anyone on a phone in sunlight.",
    sections: [
      {
        title: "Where stores usually fail",
        body: [
          "Light gray text for prices, reviews counts and footers.",
          "Sale and “new” badges in pastel colors with white text.",
          "Placeholder text in email signups and search boxes.",
          "Text over hero images and video, where the contrast changes as the image does.",
        ],
      },
      {
        title: "How to fix it",
        body: [
          "Darken the text or the background until the pair passes. Small changes usually do it: #999999 on white fails, #767676 on white passes.",
          "For text on images, put a solid or semi-opaque panel behind the text instead of relying on the photo.",
          "Fix it in the theme's color settings where you can, so every page picks it up, rather than page by page.",
        ],
      },
    ],
    faq: [
      {
        q: "What contrast ratio do I need?",
        a: "At least 4.5:1 for normal text and 3:1 for large text (about 24px, or 19px bold) to meet WCAG 2.2 AA.",
      },
      {
        q: "Does contrast apply to logos?",
        a: "No. Text that's part of a logo or brand name is exempt. Buttons, prices and links are not.",
      },
      {
        q: "How do I find every contrast failure?",
        a: "Run a free scan. Each failure shows the actual colors, the ratio, and what's required.",
      },
    ],
  },
  {
    slug: "do-accessibility-widgets-work",
    eyebrow: "Accessibility explained",
    title: "Do accessibility widgets make your site compliant?",
    description:
      "What accessibility overlays and widgets do, what they can't fix, and what the FTC's 2025 order against accessiBe means for stores that rely on one.",
    short:
      "No widget can make a site compliant on its own. A widget adds a toolbar that changes how the page looks for visitors who open it, but the underlying code, which is what screen readers use and what accessibility claims cite, stays the same. In 2025 the FTC ordered one widget maker to pay $1 million over claims that its plug-in could make any website WCAG-compliant.",
    sections: [
      {
        title: "What a widget does",
        body: [
          "Most widgets add a button that opens a panel: bigger text, higher contrast, a dyslexia font. Some also try to patch the page with scripts, for example guessing alt text.",
          "Those options can help some visitors. They don't change the theme code, so missing labels, unnamed buttons and images without alt text are still there for screen reader users, who usually don't use the widget at all.",
        ],
      },
      {
        title: "What the FTC said",
        body: [
          "In January 2025 the FTC alleged that accessiBe's accessWidget didn't make all user websites WCAG-compliant, despite the company's claims. The final order, approved in April 2025, required accessiBe to pay $1 million and bars it from claiming its automated products can make any website WCAG-compliant without evidence.",
        ],
      },
      {
        title: "What to do instead",
        body: [
          "Keep the widget if you like it, but fix the issues in the code: alt text, labels, button names, contrast. Those are usually theme fixes.",
          "Check the site after every release. New products, apps and theme edits bring new issues back.",
        ],
      },
    ],
    faq: [
      {
        q: "Should I remove my accessibility widget?",
        a: "Not necessarily. It can help some visitors. Just don't rely on it as your fix: the code issues underneath are still there.",
      },
      {
        q: "Will a scan count the widget's fixes?",
        a: "The scan checks the page as shipped, the same way a screen reader would meet it, with or without the widget.",
      },
      {
        q: "Can automated checks make my site compliant?",
        a: "No. Automated checks catch a share of issues; others need a person to test. Use them to catch regressions, not as a certification.",
      },
    ],
    sources: [
      {
        title: "FTC: FTC Approves Final Order Requiring accessiBe to Pay $1 Million (April 2025)",
        url: "https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million",
      },
    ],
  },
];
