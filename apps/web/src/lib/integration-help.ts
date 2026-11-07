// Setup help for alert integrations. One source for the in-app steps and the
// public /help pages, so the two can't drift apart.

export interface IntegrationHelp {
  slug: string;
  name: string;
  /** Search-shaped H1 for the public page. */
  title: string;
  description: string;
  short: string;
  steps: string[];
  troubleshooting: { title: string; body: string }[];
  sources: { title: string; url: string }[];
}

export const INTEGRATIONS: IntegrationHelp[] = [
  {
    slug: "microsoft-teams-alerts",
    name: "Microsoft Teams",
    title: "Send Consentinel alerts to a Microsoft Teams channel",
    description:
      "Post new critical privacy findings to a Teams channel with a Workflows webhook. Five minutes, no admin app install.",
    short:
      "Teams posts alerts through a Workflows webhook. You create it from the channel's menu, copy the link it gives you, and paste it into Consentinel.",
    steps: [
      "In Teams, open the team and the channel you want alerts in.",
      "Click the ... next to the channel name and choose Workflows.",
      'Pick the template "Send webhook alerts to a channel".',
      "Name it Consentinel. If Teams asks you to sign in to a connection, do that and click Next.",
      "Check the team and channel are right, then click Add workflow.",
      "Click Copy webhook link, paste it into Consentinel's Teams box on the Alerts page, and click Connect. A test card arrives in the channel within a few seconds.",
    ],
    troubleshooting: [
      {
        title: "There's no Workflows option on the channel menu",
        body: 'Your Teams admin may have turned off Workflows (Power Automate) for your organization. Ask IT to allow the Workflows app, or use a group chat with the "Send webhook alerts to a chat" template.',
      },
      {
        title: "Consentinel says it isn't a Teams webhook URL",
        body: "Copy the link from the workflow itself, not the channel link. It starts with https:// and ends in powerplatform.com or logic.azure.com followed by a long path.",
      },
      {
        title: 'Cards say "used a Workflow template to send this card"',
        body: "Teams adds that line to every card sent through Workflows. It can't be removed.",
      },
      {
        title: "The webhook link is a secret",
        body: "Anyone with it can post to the channel. If it leaks, delete the workflow, create a new one and reconnect.",
      },
    ],
    sources: [
      {
        title: "Microsoft: Create incoming webhooks with Workflows",
        url: "https://support.microsoft.com/en-us/teams/apps-service/create-incoming-webhooks-with-workflows-for-microsoft-teams",
      },
    ],
  },
  {
    slug: "slack-alerts",
    name: "Slack",
    title: "Send Consentinel alerts to a Slack channel",
    description:
      "Post new critical privacy findings to Slack with an incoming webhook. Create a small Slack app, pick a channel, paste the URL.",
    short:
      "Slack posts alerts through an incoming webhook. You create a small Slack app for your workspace, add a webhook for one channel, and paste its URL into Consentinel.",
    steps: [
      "Go to api.slack.com/apps and click Create New App, then From scratch.",
      "Name it Consentinel, pick your workspace and click Create App.",
      "In the left sidebar, open Incoming Webhooks and turn Activate Incoming Webhooks on.",
      "Scroll down, click Add New Webhook to Workspace, choose the channel and click Allow.",
      "Copy the webhook URL (it starts with https://hooks.slack.com/services/), paste it into Consentinel's Slack box on the Alerts page, and click Connect. A test message arrives in the channel.",
    ],
    troubleshooting: [
      {
        title: "Slack says the app needs approval",
        body: "Some workspaces only let admins install apps. Create the app anyway, request approval, and connect once an admin approves it.",
      },
      {
        title: "Can't pick a private channel",
        body: "You have to be a member of a private channel to add a webhook to it.",
      },
      {
        title: "Alerts stopped arriving",
        body: "The app was probably removed from the workspace or the webhook was deleted. Create a new webhook and reconnect.",
      },
      {
        title: "The webhook URL is a secret",
        body: "Anyone with it can post to the channel. If it leaks, delete it in the app's Incoming Webhooks page and create a new one.",
      },
    ],
    sources: [
      {
        title: "Slack: Sending messages using incoming webhooks",
        url: "https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks",
      },
    ],
  },
  {
    slug: "jira-integration",
    name: "Jira",
    title: "Open Jira tickets for privacy regressions with Consentinel",
    description:
      "Every new critical finding opens a Jira ticket with the evidence and the fix, and Done tickets trigger a rescan that confirms the fix shipped.",
    short:
      "Consentinel opens a Jira Cloud ticket for each new critical finding, and can rescan when a ticket moves to Done to confirm the fix actually reached the site.",
    steps: [
      'Sign in to id.atlassian.com/manage-profile/security/api-tokens and click Create API token (the plain one, not "with scopes"). Use an account that can create issues in the project. A dedicated user like consentinel@yourcompany.com keeps tickets from looking like a teammate wrote them.',
      "Note your Jira site (yourcompany.atlassian.net) and the project key, the letters before ticket numbers, like WEB in WEB-123.",
      "On Consentinel's Alerts page, enter the site, project key, account email and API token, then click Connect Jira.",
      "Optional: to rescan when a ticket is done, follow the steps shown after connecting. They set up a Jira Automation rule that calls Consentinel when an issue moves to Done.",
    ],
    troubleshooting: [
      {
        title: "Use your Jira Cloud URL",
        body: "Consentinel works with Jira Cloud sites on atlassian.net. Jira Server and Data Center aren't supported.",
      },
      {
        title: "Connect fails with the right token",
        body: "The account needs permission to browse the project and create issues in it. Check the project's permission scheme, or use an account that's already a project member.",
      },
      {
        title: "Scoped tokens and Atlassian service accounts don't work",
        body: "Tokens created with scopes, and tokens for Atlassian admin service accounts, only work through Atlassian's API gateway. Consentinel needs a regular API token from a normal user account.",
      },
      {
        title: "Tokens expire",
        body: "Atlassian API tokens last a year at most. When one expires, tickets stop opening. Create a new token and reconnect.",
      },
      {
        title: "More than one site",
        body: "Add ?site=yourdomain.com to the rescan URL and create one Automation rule per site.",
      },
    ],
    sources: [
      {
        title: "Atlassian: Manage API tokens",
        url: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
      },
    ],
  },
];

export function integrationHelp(slug: string): IntegrationHelp {
  const found = INTEGRATIONS.find((i) => i.slug === slug);
  if (!found) throw new Error(`no help for ${slug}`);
  return found;
}
