import { execFileSync } from "node:child_process";

/**
 * Builds the portable artifacts, signed when credentials are present.
 *
 * Windows Smart App Control refuses to run unsigned binaries outright — there
 * is no "run anyway" the way SmartScreen has one — so an unsigned build is
 * unusable on a machine that has it enabled. Signing is configured here rather
 * than in electron-builder.yml so a local build without credentials still
 * works, and CI signs as soon as the secrets are set.
 *
 * Needs, from Azure Trusted Signing:
 *   AZURE_SIGN_ENDPOINT, AZURE_SIGN_ACCOUNT, AZURE_SIGN_PROFILE
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET  (read by the signer)
 */
const { AZURE_SIGN_ENDPOINT, AZURE_SIGN_ACCOUNT, AZURE_SIGN_PROFILE } = process.env;
const signing = Boolean(AZURE_SIGN_ENDPOINT && AZURE_SIGN_ACCOUNT && AZURE_SIGN_PROFILE);

const args = ["--win", ...process.argv.slice(2)];
if (signing) {
  args.push(
    `--config.win.azureSignOptions.endpoint=${AZURE_SIGN_ENDPOINT}`,
    `--config.win.azureSignOptions.codeSigningAccountName=${AZURE_SIGN_ACCOUNT}`,
    `--config.win.azureSignOptions.certificateProfileName=${AZURE_SIGN_PROFILE}`,
  );
  console.log(`signing with Azure Trusted Signing (${AZURE_SIGN_ACCOUNT}/${AZURE_SIGN_PROFILE})`);
} else {
  console.log("no signing credentials — building unsigned (Smart App Control will block it)");
}

execFileSync("node", ["build.mjs"], { stdio: "inherit" });
execFileSync("electron-builder", args, { stdio: "inherit", shell: process.platform === "win32" });
