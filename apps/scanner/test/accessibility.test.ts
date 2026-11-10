import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { auditAccessibility, pickAuditPages } from "../src/accessibility";

// Page picking: homepage first, key shopper pages next, policies skipped, other hosts ignored.
const home = "https://shop.com/";
assert.deepEqual(
  pickAuditPages(
    home,
    [
      "https://shop.com/policies/privacy-policy",
      "https://shop.com/pages/about",
      "https://shop.com/products/blue-tee?variant=1#reviews",
      "https://other.com/products/x",
      "mailto:hi@shop.com",
      "https://shop.com/cart",
      "https://www.shop.com/collections/all",
      "https://shop.com/products/blue-tee",
      "https://shop.com/image.jpg",
      "https://shop.com/blogs/news",
    ],
    10,
  ),
  [
    { url: "https://shop.com/", label: "Homepage" },
    { url: "https://shop.com/products/blue-tee", label: "Product page" },
    { url: "https://www.shop.com/collections/all", label: "Collection page" },
    { url: "https://shop.com/cart", label: "Cart" },
    { url: "https://shop.com/pages/about", label: "About" },
    { url: "https://shop.com/blogs/news", label: "Page" },
  ],
);
// Monitor's budget is the homepage only.
assert.deepEqual(pickAuditPages(home, ["https://shop.com/cart"], 1), [
  { url: "https://shop.com/", label: "Homepage" },
]);

// End to end against a local store with known failures.
//   Homepage: image with no alt (critical), icon link with no name (serious), no lang (serious).
//   Product page: unlabeled quantity field (critical) and the same no-alt image.
//   Cart: clean apart from lang.
const layout = (body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title></head><body><main>${body}</main></body></html>`;
const PAGES: Record<string, string> = {
  "/": layout(
    `<h1>Store</h1><img src="/a.png"><a href="/cart"><svg width="10" height="10"></svg></a>
     <a href="/products/tee">Tee</a> <a href="/cart">Cart</a>`,
  ),
  "/products/tee": layout(`<h1>Tee</h1><img src="/a.png"><input type="number" name="qty">`),
  "/cart": layout(`<h1>Cart</h1><p style="color:#999;background:#aaa">Empty</p>`),
};

const server = http.createServer((req, res) => {
  const body = PAGES[req.url ?? ""];
  if (!body) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html" }).end(body);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

try {
  const one = await auditAccessibility(url, { maxPages: 1 });
  assert.equal(one.pages.length, 1);
  assert.equal(one.pages[0]?.label, "Homepage");
  const oneRules = one.issues.map((i) => i.rule);
  for (const r of ["image-alt", "link-name", "html-has-lang"]) assert.ok(oneRules.includes(r), r);
  assert.ok(!oneRules.includes("label"), "product page not audited on a one-page budget");

  const all = await auditAccessibility(url, { maxPages: 10 });
  assert.deepEqual(
    all.pages.map((p) => [p.label, p.status]),
    [
      ["Homepage", "ok"],
      ["Product page", "ok"],
      ["Cart", "ok"],
    ],
  );
  const alt = all.issues.find((i) => i.rule === "image-alt");
  assert.deepEqual(alt?.pages, ["/", "/products/tee"]);
  assert.equal(alt?.title, "Images without alt text");
  assert.ok(alt?.wcag.includes("1.1.1"));
  assert.ok(all.issues.some((i) => i.rule === "label"));
  // Worst first.
  assert.equal(all.issues[0]?.impact, "critical");
  assert.ok(all.score < 100 && all.score >= 0);
  assert.equal(all.counts.critical, all.issues.filter((i) => i.impact === "critical").length);
  console.log(
    `accessibility: all assertions passed (score ${all.score}, ${all.issues.length} issues)`,
  );
} finally {
  server.close();
}
