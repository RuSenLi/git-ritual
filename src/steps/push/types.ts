import type { BaseStep, TargetBranches } from '@/types'

/**
 * push 步骤
 * 1. git checkout <branch>
 * 2. git rev-parse --abbrev-ref <branch>@{u}
 * 3. git push --set-upstream <remote> <branch>（如果未设置上游分支）
 * 4. git fetch <remote> <branch>
 * 5. git status
 * 6. git push <remote> <branch>（如果本地 ahead）
 *
 * 以上步骤实现的目的：
 * - 依次切换到每个指定分支，确保操作的是目标分支；
 * - 检查分支是否已设置上游分支，未设置则首次 push 并建立追踪关系；
 * - 拉取远程分支最新内容，保证本地信息同步；
 * - 检查本地与远程的同步状态，避免分支落后时直接推送；
 * - 仅在本地领先时才执行 push，保证推送安全、规范。
 */
export interface PushStep extends BaseStep {
  uses: 'gitritual/push@v1'
  with: {
    targetBranches: TargetBranches
    remote?: string
  }
}
