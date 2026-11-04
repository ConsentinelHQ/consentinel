import assert from "node:assert/strict";
import { test } from "node:test";
import { findThemeTags, themeEditorUrl } from "./shopify-store-audit";

void test("finds a hardcoded Amazon tag with its line", () => {
  const liquid = [
    "<head>",
    "{{ content_for_header }}",
    '<script src="https://c.amazon-adsystem.com/aax2/apstag.js"></script>',
    "</head>",
  ].join("\n");
  const tags = findThemeTags("layout/theme.liquid", liquid);
  assert.deepEqual(tags, [
    { vendor: "Amazon Advertising", filename: "layout/theme.liquid", line: 3, consentAware: false },
  ]);
});

void test("marks a tag behind Shopify's consent API as consent-aware", () => {
  const liquid = [
    "<script>",
    "if (window.Shopify.customerPrivacy.marketingAllowed()) {",
    "  !function(f,b,e,v){}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
    "  fbq('init', '123');",
    "}",
    "</script>",
  ].join("\n");
  const [tag] = findThemeTags("snippets/meta.liquid", liquid);
  assert.equal(tag?.vendor, "Meta Pixel");
  assert.equal(tag?.line, 3);
  assert.equal(tag?.consentAware, true);
});

void test("ignores files with no vendor tags", () => {
  assert.deepEqual(findThemeTags("sections/header.liquid", "<header>{{ shop.name }}</header>"), []);
});

void test("editor link opens the file in the theme code editor", () => {
  assert.equal(
    themeEditorUrl(
      "demo.myshopify.com",
      "gid://shopify/OnlineStoreTheme/123",
      "layout/theme.liquid",
    ),
    "https://admin.shopify.com/store/demo/themes/123?key=layout%2Ftheme.liquid",
  );
});
