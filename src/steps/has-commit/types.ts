import type {
  BaseStep,
  CommitHashes,
  RequireAtLeastOne,
  ResolvableValue,
  TargetBranches,
} from '@/types'

/**
 * 定义按 commit message 进行检查的规则对象
 */
export interface CommitMessageCheck {
  /**
   * 要匹配的 message 内容。支持字符串（包含匹配）和正则表达式
   */
  message: string | string[]
  /**
   * 指定一个或多个 commit 的作者
   * 如果是数组，则匹配任意一个作者即可 (OR 条件)
   */
  author?: string | string[]
  /**
   * 可选：指定查询的日期, 格式：'YYYY-MM-DD'
   */
  date?: string | [string, string]
}

/**
 * with 对象的基础结构，所有检查都是可选的。
 */
interface HasCommitWithBase {
  /**
   * 需要被检查的一个或多个分支名称
   */
  targetBranches: TargetBranches
  /**
   * 一个或多个要通过 patch-id 检查的 commit HASH
   */
  commitHashes?: CommitHashes
  /**
   * 一个或多个按 message、author、date 检查的规则对象
   * 通过 git log --grep <message1> 检查
   */
  commitMessages?: CommitMessageCheck | CommitMessageCheck[]
  /**
   * 跳过分支选择
   * @default false
   */
  skipBranchSelection?: boolean
}

export type HasCommitStepWith = RequireAtLeastOne<
  HasCommitWithBase,
  'commitHashes' | 'commitMessages'
>

/**
 * 定义 'gitritual/has-commit@v1' 步骤的配置
 * 使用 RequireAtLeastOne 确保 commitHashes 和 commitMessages 至少提供一个
 */
export type HasCommitStep = BaseStep & {
  uses: 'gitritual/has-commit@v1'
  with: ResolvableValue<HasCommitStepWith>
}
