// dsh-rss-for-shadow-suite — host half
//
// 三件事（全部幂等，可安全重复启动）：
//   1. 修复 @dsh-routines/bundle 的 CLI 参数冲突：web profile 与 web 应用
//      共享 argv 时，routines-cli 会因未知选项（--port 等）报错。给它的
//      commander program 加上 allowUnknownOption + allowExcessArguments。
//   2. 把内置的两个例程（ai-digest / arxiv-digest）幂等落盘到
//      ~/.dsh/routines/（带版本标记；用户自己改过的文件不会被覆盖）。
//   3. 首次安装时为调度器种子化状态：ai-digest 记为「昨天已跑」（当天首启
//      即补跑）、arxiv-digest 记为「今天 09:30 前」——保证例程无需手动
//      触发一次就能进入每天自动补跑的节奏。
import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VERSION = require("../package.json").version;
export const name = "dsh-rss-for-shadow-suite";

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** 在 node_modules 里定位一个已安装包内的文件（绕过 exports 限制）。 */
function locatePackageFile(pkgName, rel) {
  const req = createRequire(import.meta.url);
  for (const searchPath of req.resolve.paths(pkgName) ?? []) {
    const candidate = join(searchPath, pkgName, rel);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** 幂等文本补丁：marker 已在文件中 → 跳过；目标代码已变 → 跳过。 */
function applyTextPatch(file, search, replacement, label, marker) {
  if (!existsSync(file)) return false;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  if (marker && content.includes(marker)) return false; // 已打过
  if (!content.includes(search)) return false; // 上游代码变了，不硬打
  const patched = content.replace(search, replacement);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, patched, "utf8");
  try {
    // 断开 pnpm 硬链接：删除原文件后改名写回
    unlinkSync(file);
    renameSync(tmp, file);
  } catch {
    writeFileSync(file, patched, "utf8");
    rmSync(tmp, { force: true });
  }
  console.log(`[dsh-rss-for-shadow-suite] patched ${label}`);
  return true;
}

function patchRoutinesCli() {
  const cli = locatePackageFile("@dsh-routines/bundle", "lib/cli.js");
  if (!cli) return;
  applyTextPatch(
    cli,
    ".helpOption('-h, --help', 'show this help')",
    ".helpOption('-h, --help', 'show this help')\n        .allowUnknownOption() // local patch: tolerate sibling app flags (--port etc.) in shared profiles\n        .allowExcessArguments(true) // local patch: ignore the passed-through sibling flags in daemon mode",
    "@dsh-routines/bundle/lib/cli.js (arg tolerance)",
    "allowUnknownOption() // local patch",
  );
}

function installRoutines() {
  const targetDir = join(dshHome(), "routines");
  mkdirSync(targetDir, { recursive: true });
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = join(here, "..", "routines");
  const markerFile = join(targetDir, `.dsh-plugin-dsh-rss-for-shadow-suite@${VERSION}`);
  const markerOk = existsSync(markerFile);

  const files = ["ai-digest.yaml", "arxiv-digest.yaml"];
  for (const file of files) {
    const target = join(targetDir, file);
    if (!existsSync(target)) {
      copyFileSync(join(bundled, file), target);
      console.log(`[dsh-rss-for-shadow-suite] installed routine ${file}`);
    }
  }
  if (!markerOk) {
    writeFileSync(markerFile, `installed by dsh-rss-for-shadow-suite@${VERSION}`, "utf8");
  }
}

/** 种子化调度状态：仅补缺失条目，绝不改动已有记录。 */
function seedState() {
  // 调度器的 projectDir 默认是服务器进程的 cwd
  const stateDir = join(process.cwd(), ".dsh", "routines");
  const statePath = join(stateDir, "state.json");
  let state = { paused: [], lastRunAt: {} };
  if (existsSync(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8"));
      state = {
        paused: Array.isArray(parsed.paused) ? parsed.paused : [],
        lastRunAt: parsed.lastRunAt && typeof parsed.lastRunAt === "object" ? parsed.lastRunAt : {},
      };
    } catch { /* 损坏的状态当作空处理 */ }
  }
  let changed = false;
  const now = new Date();
  const tzMs = 8 * 3600 * 1000; // 与例程 timezone Asia/Shanghai 一致
  const todayMidnightLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const localToUtc = (ms) => ms - tzMs;
  if (!(state.lastRunAt["ai-digest"] > 0)) {
    // 昨天 00:00（+08）→ 今天任何时刻首启即触发补跑
    state.lastRunAt["ai-digest"] = localToUtc(todayMidnightLocal - 24 * 3600 * 1000);
    changed = true;
  }
  if (!(state.lastRunAt["arxiv-digest"] > 0)) {
    // 今天 09:30（+08）→ 09:30 前启动则等点触发，之后启动立即补跑
    state.lastRunAt["arxiv-digest"] = localToUtc(todayMidnightLocal) + 9.5 * 3600 * 1000;
    changed = true;
  }
  if (changed) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
    console.log(`[dsh-rss-for-shadow-suite] seeded scheduler state at ${statePath}`);
  }
}

export function apply(ctx) {
  ctx.effect(async () => {
    try {
      patchRoutinesCli();
      installRoutines();
      seedState();
      ctx.logger?.info?.("[dsh-rss-for-shadow-suite] routines + feeds ready");
    } catch (error) {
      ctx.logger?.warn?.("[dsh-rss-for-shadow-suite] setup failed: " + String(error?.message ?? error));
    }
  }, "dsh-rss-for-shadow-suite: setup");
}
