#!/usr/bin/env node
/**
 * Set the Gemini API key locally and (optionally) in the Cloudflare Worker
 * secret, without the key ever passing through the agent's chat context.
 *
 * Run this in YOUR OWN terminal, in this folder:
 *   node scripts/set-gemini-key.mjs           # writes .dev.vars only
 *   node scripts/set-gemini-key.mjs --deploy  # also sets the Worker secret
 *
 * The key is typed into your terminal with echo off, written to .dev.vars
 * (git-ignored), and piped straight into `wrangler secret put` when
 * --deploy is given. It is never printed, never logged, never committed.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devVars = join(root, ".dev.vars");
const deploy = process.argv.includes("--deploy");

/**
 * Read a secret from the terminal with echo disabled.
 * PowerShell's SecureString is used on Windows; `stty -echo` elsewhere.
 */
function readSecret(prompt) {
  if (process.platform === "win32") {
    const ps =
      "$p = Read-Host -AsSecureString '" +
      prompt.replace(/'/g, "''") +
      "'; " +
      "$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); " +
      "$t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b); " +
      "[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b); " +
      "[Console]::Write($t)";
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
    if (r.status !== 0 || !r.stdout) {
      console.error("\nCould not read the key. Aborting.");
      process.exit(1);
    }
    return r.stdout.trim();
  }

  const r = spawnSync("sh", ["-c", `stty -echo; printf '%s' "${prompt}"; head -n1; stty echo`], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  return (r.stdout || "").trim();
}

console.log(
  "This writes the key to .dev.vars (git-ignored) and never prints it.\n" +
    "Paste the NEW Gemini key when prompted.\n",
);

const key = readSecret("New GEMINI_API_KEY: ");
if (!key || !/^[A-Za-z0-9_\-\.]{20,}$/.test(key)) {
  console.error(
    "\nThat does not look like a Gemini API key (expected AIza... or AQ.Ab8...). Aborting.",
  );
  process.exit(1);
}

// Write .dev.vars, preserving any other lines.
const existing = existsSync(devVars) ? readFileSync(devVars, "utf8") : "";
const lines = existing.split(/\r?\n/).filter((l) => l.length > 0);
const kept = lines.filter((l) => !/^GEMINI_API_KEY=/.test(l));
kept.push(`GEMINI_API_KEY=${key}`);
writeFileSync(devVars, kept.join("\n") + "\n", "utf8");
console.log("\nWrote .dev.vars (git-ignored).");

if (deploy) {
  console.log("Setting the Worker secret for 'arabic-pipeline'…");
  const res = spawnSync("npx", ["wrangler", "secret", "put", "GEMINI_API_KEY"], {
    input: key + "\n",
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
  });
  if (res.status !== 0) {
    console.error("wrangler secret put failed - the Worker still has the OLD key.");
    process.exit(res.status || 1);
  }
  console.log("Worker secret updated. To update the MCP Worker too, run:");
  console.log("  npx wrangler deploy -c wrangler.mcp.toml");
} else {
  console.log("To also update the live Worker, re-run with --deploy:");
  console.log("  node scripts/set-gemini-key.mjs --deploy");
}
