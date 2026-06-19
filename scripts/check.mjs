import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ignoredDirectories = new Set([".git", ".deploy-git", ".codex", ".agents", ".tools", "node_modules"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...await collectFiles(join(directory, entry.name)));
      continue;
    }
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(join(directory, entry.name));
  }
  return files;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code) reject(new Error(`node ${args.join(" ")} exited with ${code}`));
      else resolve();
    });
  });
}

const files = (await collectFiles(root)).sort((a, b) => a.localeCompare(b));
for (const file of files) await runNode(["--check", relative(root, file)]);

const testFiles = files.filter((file) => /[\\/]tests[\\/].+\.test\.mjs$/.test(file)).map((file) => relative(root, file));
if (testFiles.length) await runNode(["--test", ...testFiles]);
