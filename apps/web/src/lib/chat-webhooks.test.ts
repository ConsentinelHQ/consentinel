import assert from "node:assert/strict";
import { test } from "node:test";
import { isTeamsWebhookUrl, slackPayload, teamsPayload } from "@consentinel/notify";

const msg = {
  text: "1 new critical finding on shop.com.",
  link: { url: "https://x/r", label: "See it" },
};

void test("accepts Teams Workflows URLs", () => {
  assert.ok(
    isTeamsWebhookUrl(
      "https://default1234.56.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/abc/triggers/manual/paths/invoke?api-version=1&sig=x",
    ),
  );
  assert.ok(
    isTeamsWebhookUrl("https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual"),
  );
});

void test("refuses anything that isn't Microsoft over https", () => {
  for (const url of [
    "http://prod-12.westus.logic.azure.com/workflows/abc",
    "https://logic.azure.com.evil.com/x",
    "https://evil.com/?h=api.powerplatform.com",
    "https://user:pw@prod-1.logic.azure.com/x",
    "https://prod-1.logic.azure.com:8080/x",
    "https://outlook.webhook.office.com/webhookb2/x",
    "https://hooks.slack.com/services/x",
    "not a url",
  ]) {
    assert.equal(isTeamsWebhookUrl(url), false, url);
  }
});

void test("Slack gets mrkdwn link text", () => {
  assert.deepEqual(slackPayload(msg), {
    text: "1 new critical finding on shop.com. <https://x/r|See it>",
  });
});

void test("Teams gets an Adaptive Card with a button", () => {
  const card = (teamsPayload(msg) as { attachments: { content: Record<string, unknown> }[] })
    .attachments[0]?.content;
  assert.equal(card?.["type"], "AdaptiveCard");
  assert.deepEqual(card?.["actions"], [
    { type: "Action.OpenUrl", title: "See it", url: "https://x/r" },
  ]);
});
