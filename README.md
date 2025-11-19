# git-ritual

可配置的交互式 Git 批处理 cli 工具。通过 `uses: "gitritual/create-with-pick@v1"` 等指令集轻松完成一系列 Git 操作。

## 特性

- ⚙️ 核心指令集

  - 内置 `gitritual/*`：`cherry-pick`、`create-with-pick`、`has-commit`、`push` 等高频批处理能力

- 🤝 交互与容错

  - 冲突时交互式处理：继续/跳过/中止/重试
  - 运行时 `prompt` 动态输入分支、提交等参数

- 🧠 变更去重与精准定位

  - Patch-Id 去重，避免重复 cherry-pick
  - 正则匹配分支、模糊匹配提交信息，快速命中目标

- 🧩 配置与扩展

  - TS/JS 与函数式配置，步骤可组合、可复用
  - 自定义任务 `{ name?: string; run: string | string[] }`

- 📈 可观测性与稳健性
  - 日志按天轮转：普通 14 天、错误 30 天；旧日志自动压缩归档
  - 关键步骤前的状态校验与远程同步，降低风险

## 场景化亮点

- 🚑 热修复一条龙

  - 从 `release/main` 创建 `hotfix/*`，自动 cherry-pick 多个提交，校验 Patch-Id 去重，必要时一键推送

- 🌊 多分支回灌

  - 将同一组修复批量回灌到多个目标分支（如 `release/*`、`beta/*`），正则选分支，自动跳过已存在变更

- 🔍 提交审计与合规

  - 基于 Patch-Id 或提交信息（支持正则/作者/时间范围）审计跨分支的变更是否已覆盖

- 🚀 批量推送与追踪校验

  - 大规模推送前自动检查 `ahead/behind` 与远程追踪状态，减少误操作

- 🧪 半自动化协作
  - 遇到 cherry-pick 冲突时，允许人工解决后继续流程，兼顾稳定性与效率

## 工作模式

- ✨ 独立工作区（推荐）

  - 在任意目录新建一个“ritual 工作区”，安装并编写 `gitritual.config.ts/js`。
  - 在配置中通过 `globals.cwd` 指向实际目标仓库路径。
  - 从该工作区运行 `git-ritual`，不会改动目标仓库的依赖或文件结构。

- 集成到目标仓库

  - 将本包作为开发依赖安装，并在仓库根目录放置 `gitritual.config.*`。
  - 为避免配置文件被分支切换/工作区整洁度阻断，请将其加入 `.gitignore`。

## `.gitignore` 示例：

```gitignore
# git-ritual
gitritual-log/

# 集成到目标仓库时
gitritual.config.*
```

## 安装

```bash
npm i -D git-ritual
```

- Node 要求：Node >= 18.18

## 快速开始

1.  在你的仓库根目录创建配置文件（支持 TS/JS）：`gitritual.config.ts`。

```ts
import { defineConfig } from 'git-ritual'

export default defineConfig({
  globals: {
    cwd: 'C:/path/to/your/repo',
  },
  steps: [
    {
      name: '合并提交到指定分支',
      uses: 'gitritual/cherry-pick@v1',
      with: {
        targetBranches: 'beta',
        commitHashes: ['def456...', 'abc123...'],
      },
    },
    {
      name: '基于指定分支创建新分支并 cherry-pick 指定提交',
      uses: 'gitritual/create-with-pick@v1',
      with: {
        tasks: [
          {
            baseBranch: 'release/main',
            newBranch: 'hotfix/1.0.0',
            commitHashes: ['def456...', 'abc123...'],
          },
        ],
      },
    },
    {
      name: '检查提交是否存在',
      uses: 'gitritual/has-commit@v1',
      with: {
        targetBranches: { branches: ['/release-/', '/beta/'], isRegex: true },
        commitMessages: {
          message: 'feat: .*important.*',
          author: 'J',
          date: ['2025-01-01', '2025-01-30'],
        },
      },
    },
  ],
})
```

如使用 JS，请确保 ESM 语法可用（推荐 `gitritual.config.mjs`，或在项目 `package.json` 中设置 `"type": "module"`）：

2.  运行

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "start-gr": "gr"
  }
}
```

然后运行 `npm run start-gr`。

运行时会：

- 自动校验当前目录是否为 Git 仓库，且工作区干净且不在 Merge/Rebase/Cherry-Pick 中。
- 先 `git fetch --all --prune` 同步远程。
- 询问要执行的步骤（可通过 `globals.skipStepSelection` 跳过）。

## 自定义 prompts 交互式配置

`defineConfig` 支持函数式配置，你可以使用 [prompts](https://github.com/bombshell-dev/clack/tree/v0) 进行 CLI 交互，动态选择预设配置或收集参数。下面示例展示“多配置选择”的写法：

```ts
import type { Config as GitRitualConfig } from 'git-ritual'
import process from 'node:process'
import { defineConfig, prompts } from 'git-ritual'

const presets: Record<string, GitRitualConfig> = {
  web: { globals: { cwd: '' }, steps: [] },
  h5: { globals: { cwd: '' }, steps: [] },
}

export default defineConfig(async () => {
  const key = await prompts.select({
    message: '请选择配置',
    options: Object.keys(presets).map(k => ({ label: k, value: k })),
  })
  if (prompts.isCancel(key)) {
    process.exit(1)
  }
  return presets[key]
})
```

另外，steps 的 `with` 字段也支持使用 [prompts](https://github.com/bombshell-dev/clack/tree/v0) 进行交互式配置。

示例（片段）：

```ts
import { prompts } from 'git-ritual'

const step = {
  name: '在 cli 输入 hash 进行 cherry-pick',
  uses: 'gitritual/cherry-pick@v1',
  with: async () => {
    const commits = await prompts.text({ message: '提交哈希(逗号分隔)' })
    return {
      targetBranches: 'beta',
      commitHashes: String(commits)
        .split(',')
        .map(s => s.trim()),
    }
  },
}
```

## 配置结构

- 配置文件主结构

```ts
function defineConfig(
  config: Config | Promise<Config> | (() => Config | Promise<Config>)
): typeof config {
  return config
}

interface Config {
  /** 全局配置 */
  globals: {
    /** 工作目录，你的 Git 仓库路径 */
    cwd: string
    /**
     * git 指令集操作结束后是否自动 push
     * @default false
     */
    push?: boolean
    /**
     * 远程仓库地址
     * @default origin
     */
    remote?: string
    /**
     * patch-id 检查深度。
     * 指定在目标分支上向前追溯多少个 commit 来检查变更是否存在
     * 数字越大越安全，但速度会越慢
     * @default 30
     */
    patchIdCheckDepth?: number
    /**
     * cli 启动时默认交互式选择要执行的 steps，设为 true 则执行所有 steps
     * @default false
     */
    skipStepSelection?: boolean
  }
  /** 批处理步骤 */
  steps: Array<{
    /** 步骤名称 */
    name?: string
    /** 自定义 shell 命令 */
    run?: string | string[]
    /** 内置 `gitritual/*` 指令集 */
    uses: string
    /** 指令集参数 */
    with?: Record<string, any>
  }>
}
```

- `uses` 内置指令集
  - `gitritual/cherry-pick@v1`：cherry-pick 指定提交到指定分支
  - `gitritual/create-with-pick@v1`：基于指定分支创建新分支并 cherry-pick 指定提交
  - `gitritual/has-commit@v1`：检查指定提交是否存在于指定分支
  - `gitritual/push@v1`：push 指定分支

## 交互与失败处理

- 开始时可多选要运行的步骤（按 `a` 全选/反选）。
- 各步骤内涉及的分支/任务也支持多选。
- 出现错误时会给出选项：
  - **Continue**：用于解决冲突后继续（会自动执行 `git cherry-pick --continue`）。
  - **Retry**：适合网络等临时性错误。
  - **Skip**：跳过当前分支/任务继续下一个。
  - **Abort**：终止流程。

## 注意事项

- 确保 `globals.cwd` 指向你的 Git 仓库根目录。
- 运行前请保持工作区干净，避免处于 Merge/Rebase/Cherry-Pick 中间态。
- 正则匹配分支时支持字面量形式字符串：`'/pattern/flags'` 与普通字符串。
- 默认远程为 `origin`，可在 `globals.remote` 或步骤 `with.remote` 覆盖。

## 许可

MIT
