import type {
  BaseStep,
  CommitHashes,
  ResolvableValue,
  TargetBranches,
} from '@/types'

export interface CherryPickStepWith {
  targetBranches: TargetBranches
  commitHashes: CommitHashes
  push?: boolean
  remote?: string
  /**
   * 跳过分支选择
   * @default false
   */
  skipBranchSelection?: boolean
}

/**
 * cherry-pick 步骤，批量将指定提交应用到目标分支。
 * 对应 git 命令：
 * 1. git checkout <targetBranch>
 * 2. git fetch <remote> <targetBranch>
 * 3. git pull --ff-only <remote> <targetBranch>
 * 4. git cherry-pick <commit1> <commit2> ...
 * 5. git push <remote> <targetBranch>
 */
export interface CherryPickStep extends BaseStep {
  uses: 'gitritual/cherry-pick@v1'
  with: ResolvableValue<CherryPickStepWith>
}
