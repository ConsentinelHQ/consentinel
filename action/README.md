# Consentinel consent check

Scans your site after each deploy and fails the job when a release adds a tracker that fires after visitors opt out. The job summary lists each new finding, the fix, and the exact Google Tag Manager tag to change when the tag loads through GTM.

## Setup

1. In Consentinel, open your site and copy the URL under **Scan after every deploy**.
2. In GitHub, save it as a repository secret named `CONSENTINEL_DEPLOY_HOOK`.
3. Add this step after your deploy step:

```yaml
- name: Consent check
  uses: ConsentinelHQ/consentinel/action@main
  with:
    hook-url: ${{ secrets.CONSENTINEL_DEPLOY_HOOK }}
```

## Inputs

| Input             | Default | What it does                                                                                                      |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `hook-url`        |         | Your deploy URL. Required. Keep it in a secret.                                                                   |
| `fail-on`         | `new`   | `new` fails on critical findings that weren't in recent scans. `any` fails on any critical. `never` only reports. |
| `wait`            | `true`  | `false` starts the scan and moves on. You still get the email alert.                                              |
| `timeout-minutes` | `15`    | How long to wait for the result.                                                                                  |
| `fail-on-error`   | `false` | Fail the job if the scan can't run. Off by default, so a problem on our side never blocks a deploy.               |

## Outputs

`scan-id`, `report-url`, `verdict` (`pass`, `fail`, `baseline`, `error` or `started`) and `new-critical`.

The first scan of a site, and the first after a scanner update, is a baseline: nothing to compare against, so it passes.

Runs on Linux and macOS runners. It needs `curl` and `jq`, which GitHub's runners include. Needs a Monitoring, Growth or Agency plan.
