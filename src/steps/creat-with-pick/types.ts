import type { BaseStep, CommitHashes } from '@/types'

/**
 * 定义单个“创建与挑选”任务的结构
 */
export interface CreationTask {
  /**
   * 作为创建新分支基础的源分支名称
   */
  baseBranch: string
  /**
   * 需要被创建的新分支的名称
   */
  newBranch: string
  /**
   * 需要被 cherry-pick 到新分支的一个或多个 commit hashes
   */
  commitHashes: CommitHashes
}

/**
 * 'gitritual/create-with-pick@v1'
 * 创建新分支并 cherry-pick 指定提交。
 * 对应 git 命令：
 * 1. git checkout <baseBranch>
 * 2. git fetch <remote> <baseBranch>
 * 3. git pull --ff-only <remote> <baseBranch>
 * 4. 检查本地是否存在 <newBranch>，存在则 git fetch <remote> <newBranch> 并 checkout，不存在则 git checkout -b <newBranch> <baseBranch>
 * 5. git cherry-pick <commit1> <commit2> ...
 * 6. git push <remote> <newBranch>
 */
export interface CreateWithPickStep extends BaseStep {
  uses: 'gitritual/create-with-pick@v1'
  with: {
    tasks: CreationTask[]
    /**
     * 操作完成后是否将新分支推送到远程
     * @default false
     */
    push?: boolean
    /**
     * 远程仓库的名称
     * @default 'origin'
     */
    remote?: string
    /**
     * 是否跳过开始前的交互式任务选择
     * @default false
     */
    skipTaskSelection?: boolean
  }
}
