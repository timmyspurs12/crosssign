/**
 * Extract the headless Chromium that `@sparticuz/chromium` ships, for machines
 * where `npx playwright install` is unavailable (CI sandboxes, containers).
 *
 * Usage (from this directory — module resolution needs qa/node_modules):
 *
 *   cd qa
 *   node get-chromium.mjs                 # prints the executable path
 *   CHROMIUM_PATH=$(node get-chromium.mjs) node wallet-state.mjs
 *
 * The heavy lifting is done by @sparticuz/chromium: it brotli-decompresses the
 * browser to /tmp/chromium on first call. If the binary refuses to start on an
 * older glibc, the Amazon Linux 2023 shared libraries are available in the same
 * package (`bin/al2023.tar.br`) and can be prepended to LD_LIBRARY_PATH.
 */
import chromium from "@sparticuz/chromium";

const executablePath = await chromium.executablePath();
console.log(executablePath);
