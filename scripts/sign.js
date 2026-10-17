// Signs the extension on AMO as unlisted. Run via `npm run sign`, which loads .env (if present) into the environment;
// WEB_EXT_API_KEY / WEB_EXT_API_SECRET set in the shell work too.
const { spawnSync } = require("node:child_process");

for (const name of ["WEB_EXT_API_KEY", "WEB_EXT_API_SECRET"]) {
  if (!process.env[name]) {
    console.error(`${name} is not set: fill it in .env (see .env.example) or set it in the shell.`);
    process.exit(1);
  }
}

// Never package secrets, tooling or docs: only the extension itself goes to AMO.
const IGNORED = ["test/**", "docs/**", "scripts/**", "*.md", "package.json", ".env*", ".amo-upload-uuid"];

const result = spawnSync("npx", ["web-ext", "sign", "--channel=unlisted", "--source-dir", ".", "--ignore-files", ...IGNORED.map((glob) => `"${glob}"`)], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
