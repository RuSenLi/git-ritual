import type { uses } from './uses'

/**
 * 工具类型，它能将一个类型 T 中的某些键（Keys）
 * 变为“至少一个必填”。
 *
 * @example
 * type MyType = RequireAtLeastOne<{ a?: number, b?: string }, 'a' | 'b'>;
 * // MyType 现在是 ({ a: number, b?: string } | { a?: number, b: string })
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
>
& {
  [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
}[Keys]

export type ResolvableValue<T> = T | (() => T | Promise<T>)

export interface GitRitualGlobals {
  /** @default origin */
  remote?: string
  /** @default false */
  push?: boolean
  /** @default false */
  cwd: string
  /**
   * patch-id 检查深度。
   * 指定在目标分支上向前追溯多少个 commit 来检查变更是否存在
   * 数字越大越安全，但速度会越慢
   * @default 30
   */
  patchIdCheckDepth?: number
  /**
   * 是否跳过选择要执行的steps
   * @default false
   */
  skipStepSelection?: boolean
}

export type CommitHashes = string | string[]
type Branches = string | string[]
/** 支持正则表达式 */
export type TargetBranches
  = | Branches
    | { branches: Branches, isRegex?: boolean }

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
 * 自定义任务，可执行任意 shell 命令。
 * 对应 git 或其它命令行操作。
 */
export interface CustomTaskStep extends BaseStep {
  run?: string | string[]
}

/**
 * 所有支持的步骤类型联合
 */
export type GitRitualStep = uses | CreatePrStep | CustomTaskStep

/**
 * 配置文件主结构
 */
export interface Config {
  globals: GitRitualGlobals
  steps: GitRitualStep[]
}
