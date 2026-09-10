import { spawnSync } from "child_process";

// Runs the whole QA suite in one command.
// Requires the app to be running on http://localhost:3000 (npm run dev).

const scripts = ["check.mjs", "layout.mjs", "shot.mjs"];
let failed = false;

for (const s of scripts) {
  console.log(`\n━━━ ${s} ━━━`);
  const r = spawnSync("node", [s], { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    failed = true;
    console.log(`✖  ${s} exited with status ${r.status}`);
  }
}

console.log(failed ? "\nQA: FAILURES (see above)" : "\nQA: ALL PASS");
process.exit(failed ? 1 : 0);
