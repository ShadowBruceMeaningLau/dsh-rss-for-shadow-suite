# dsh-rss-for-shadow-suite

Shadow 套件的一站式资讯订阅插件：**33 个 RSS 订阅源**（AI / 数学 / 物理 / 计算机）+ **每日简报与论文速递**两个定时例程，安装即用。

## 安装

web 与 headless 两个 profile 各装一次：

```sh
dsh plugin --profile web add github:ShadowBruceMeaningLau/dsh-rss-for-shadow-suite
dsh plugin --profile headless add github:ShadowBruceMeaningLau/dsh-rss-for-shadow-suite
```

重启 `dsh web`。此后：

- **AI 每日简报**：每天首次启动服务器时自动生成（补跑最近一次）
- **论文速递**：每天 9:30 触发（arXiv 8-9 点发完论文后）；9:30 后启动服务器则立即补跑
- 两份产出都写入例程 `cwd` 指向的目录：`<cwd>/RSS订阅/简报-日期.md` 与 `论文速递-日期.md`（`cwd` 需安装后自行配置，见「首次配置」）

## 组成

| 文件 | 作用 |
| --- | --- |
| `cordis.patch.yml` | 挂载 tool-jobs 重启用、dsh-rss 行（代理/UA/33 源）、dsh-routines 三行 |
| `routines/` | 内置 ai-digest 与 arxiv-digest 两个例程 |
| `lib/index.js` | 启动时：落盘例程 + 种子化调度状态 + 修复 dsh-routines 的 CLI 参数冲突 |

## 订阅源清单（33 个）

- **DSH 生态**：deepseek-harness Releases
- **AI**：Simon Willison、HuggingFace Blog、LessWrong、OpenAI/Google 官方博客、Ars/TechCrunch/Verge AI、机器之心、量子位、新智元
- **计算机**：Hacker News、Lobsters、少数派、爱范儿、36氪、InfoQ 中文
- **数学/物理**：Quanta、Physics World、Nature 数学与计算、Science News
- **arXiv 论文**：cs.AI / cs.LG / cs.CL / cs.SE / math / math-ph / hep-th / cond-mat / gr-qc / physics / quant-ph

## 首次配置（安装后必做）

源码中的例程 `cwd` 是占位符（仓库不携带任何人的本机路径）。安装后打开 `~/.dsh/routines/ai-digest.yaml` 与 `arxiv-digest.yaml`，把 `cwd` 改成你的 Obsidian 库路径（例：`D:/Obsidian本地库/书籍管理`），保存即可——插件不会覆盖你改过的例程文件。若 RSS 抓取需要代理，再按「配置说明」设置 `proxyUrl`。

## 配置说明

- **代理**：`cordis.patch.yml` 里 rss 行的 `proxyUrl` 默认为空（不代理）；需要代理时改成你的代理地址（如 `http://127.0.0.1:7897`）后重装，或直接改 profile 的补丁覆盖
- **OCR/其他密钥**：本插件不涉及；订阅源均为公开 RSS，无需密钥
- **例程文件**：安装后位于 `~/.dsh/routines/`，可直接编辑（插件不会覆盖你改过的文件）
- **调度状态**：位于服务器启动目录的 `.dsh/routines/state.json`，首次安装自动种子化

## 卸载

```sh
dsh plugin --profile web remove dsh-rss-for-shadow-suite
dsh plugin --profile headless remove dsh-rss-for-shadow-suite
# 例程文件与状态仍在（自包含），如需彻底清除再删 ~/.dsh/routines/ 下的对应文件
```

## 许可证

MIT，见 [LICENSE](LICENSE)。
