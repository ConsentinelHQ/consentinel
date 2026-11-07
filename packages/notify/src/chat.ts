/** One alert, written once and rendered per chat app. */
export interface ChatMessage {
  text: string;
  link: { url: string; label: string };
}

export function slackPayload(msg: ChatMessage): { text: string } {
  return { text: `${msg.text} <${msg.link.url}|${msg.link.label}>` };
}

/**
 * Teams Workflows webhooks take an Adaptive Card wrapped in a message. The old
 * Office 365 connector format (MessageCard) is retired, so cards only.
 */
export function teamsPayload(msg: ChatMessage): unknown {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [{ type: "TextBlock", text: msg.text, wrap: true }],
          actions: [{ type: "Action.OpenUrl", title: msg.link.label, url: msg.link.url }],
        },
      },
    ],
  };
}

// Workflows URLs live on Power Platform or Logic Apps. Anything else is refused,
// so a pasted URL can't point the server at an internal or third-party host.
const TEAMS_HOSTS = [/\.api\.powerplatform\.com$/, /\.logic\.azure\.com$/];

export function isTeamsWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;
  return TEAMS_HOSTS.some((h) => h.test(url.hostname));
}
