import { assertScannableUrl, isPrivateAddress } from "../src/safety";
import { assertRedisReachable } from "../src/queue";

const checks: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean): void => {
  checks.push([name, ok]);
};

async function main(): Promise<void> {
  check("blocks cloud metadata endpoint", isPrivateAddress("169.254.169.254"));
  check("blocks RFC1918", isPrivateAddress("10.0.0.5") && isPrivateAddress("192.168.1.1"));
  check("blocks loopback", isPrivateAddress("127.0.0.1"));
  check("blocks CGNAT range", isPrivateAddress("100.64.0.1"));
  check("blocks IPv4-mapped IPv6 loopback", isPrivateAddress("::ffff:127.0.0.1"));
  check("blocks IPv6 unique-local", isPrivateAddress("fd00::1"));
  check("allows a public address", !isPrivateAddress("93.184.216.34"));
  check("rejects non-http scheme", !(await assertScannableUrl("file:///etc/passwd")).ok);
  check("rejects credentials in URL", !(await assertScannableUrl("https://u:p@example.com")).ok);
  check("rejects a database port", !(await assertScannableUrl("http://example.com:5432/")).ok);
  check(
    "rejects a private target by default",
    !(await assertScannableUrl("http://127.0.0.1:8080/")).ok,
  );
  check(
    "allows a private target only when explicitly opted in",
    (await assertScannableUrl("http://127.0.0.1:8080/", { allowPrivate: true })).ok,
  );

  // A dead Redis must fail loudly and fast, not retry forever in silence.
  const start = Date.now();
  let failedFast = false;
  try {
    await assertRedisReachable("redis://127.0.0.1:6399", 2_000);
  } catch (e) {
    failedFast =
      Date.now() - start < 10_000 && e instanceof Error && !e.message.includes("***undefined");
  }
  check("unreachable Redis fails fast instead of hanging", failedFast);

  let pass = true;
  console.log("\nConsentinel queue - SSRF guard proof\n");
  for (const [name, ok] of checks) {
    pass = pass && ok;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  }
  console.log(pass ? "\n  SSRF guard green.\n" : "\n  FAILED\n");
  process.exit(pass ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
