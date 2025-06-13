import type { uses } from './uses'

export interface GitRitualGlobals {
  /** @default origin */
  remote?: string
  /** @default false */
  push?: boolean
  /** @default false */
  cwd: string
}

export type CommitHashes = string | string[]
export type TargetBranches = string | string[]

/**
 * 所有步骤通用字段。
 */
export interface BaseStep {
  name?: string
}

export type GitRitualPlatform = 'github' | 'gitlab' | 'gitee' | 'coding'

/**
 * 创建 Pull Request 或 Merge Request，支持多平台和本地化仓库。
 * 常见平台：GitHub、GitLab、Gitee、Coding 等。
 * 调用平台 API 创建 PR/MR。
 */
export interface CreatePrStep extends BaseStep {
  uses: 'gitritual/create-pr@v1'
  with: {
    /** 远程仓库地址。如未指定则继承全局配置。 */
    remote?: string
    /** 目标平台，如 github、gitlab、gitee、coding、自定义。 */
    platform: GitRitualPlatform | string
    /** 平台 API 地址，支持本地化/自建平台。 */
    apiUrl?: string
    /** 认证 token，用于 API 鉴权。 */
    token?: string
    /** 仓库所属组织或用户名。 */
    owner?: string
    /** 仓库名。 */
    repo?: string
    /** PR/MR 标题。 */
    title?: string
    /** PR/MR 描述内容。 */
    description?: string
    /** 源分支（发起 PR/MR 的分支）。 */
    sourceBranch?: string
    /** 目标分支（PR/MR 要合入的分支）。 */
    targetBranch?: string
    /** 是否为草稿 PR/MR（部分平台支持）。 */
    draft?: boolean
    /** 评审人用户名列表（部分平台支持）。 */
    reviewers?: string[]
    /** 标签列表，为 PR/MR 添加标签（部分平台支持）。 */
    labels?: string[]
    /** 指派处理人用户名列表（部分平台支持）。 */
    assignees?: string[]
    /**
     * 平台专属参数，字段名与平台 API 保持一致，优先级高于通用参数。
     * 用于传递平台特有或高级参数，适配所有平台的扩展需求。
     */
    params?: Record<string, any>
  }
}

/**
 * 工具类型：要求 T 的属性中至少有一个必填
 */
export type RequireAtLeastOne<
  T,
  Keys extends keyof T = keyof T,
> = Keys extends keyof T ? Omit<T, Keys> & Required<Pick<T, Keys>> : never

export interface commitMessage {
  message: string
  author?: string
  date?: string
}
export type CommitMessages
  = | string
    | string[]
    | commitMessage
    | commitMessage[]

/**
 * 检查目标分支是否包含指定提交信息。
 * 对应 git 命令：
 * 1. git fetch --all
 * 2. git checkout <targetBranch>
 * 3. git pull --ff-only <remote> <targetBranch>
 * 4. git log --grep <message1> --grep <message2> ...
 */
export interface HasCommitStep extends BaseStep {
  uses: 'gitritual/has-commit@v1'
  with: {
    targetBranches: TargetBranches
  } & RequireAtLeastOne<{
    commitMessages?: CommitMessages
    commitHashes?: CommitHashes
  }>
}

/**
 * 自定义任务，可执行任意 shell 命令。
 * 对应 git 或其它命令行操作。
 */
export interface CustomTaskStep extends BaseStep {
  run?: string | string[]
}

/**
 * 所有支持的步骤类型联合
 */
export type GitRitualStep
  = | uses
    | CreatePrStep
    | HasCommitStep
    | CustomTaskStep

/**
 * 配置文件主结构
 */
export interface Config {
  globals: GitRitualGlobals
  steps: GitRitualStep[]
}
