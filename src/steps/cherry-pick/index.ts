import type { CherryPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import { performCherryPickFlow, reportAndFinalizeStep } from '@/steps/shared'
import { filterCommitsToApply, toArray } from '@/steps/shared/finders'
import {
  isRepositoryInSafeState,
  prepareBranch,
  selectBranchesToProcess,
} from '@/steps/shared/lifecycle'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

/**
 * `uses:cheryy-pick` 步骤的处理器函数
 * @param step - CherryPickStep 类型的步骤配置
 * @param globals - 全局配置
 */
export async function handleCherryPick(
  step: CherryPickStep,
  globals: GitRitualGlobals,
) {
  const { cwd, patchIdCheckDepth } = globals
  const { targetBranches, commitHashes, skipBranchSelection } = step.with
  const remote = step.with.remote ?? globals.remote ?? 'origin'
  const shouldPush = step.with.push ?? globals.push ?? false

  // 1. 从配置中获取初始分支列表，并让用户交互式选择
  const selectedBranches = await selectBranchesToProcess({
    targetBranches,
    skipBranchSelection,
    cwd,
    message:
      'Which branches to process for cherry-pick? (Press <a> to toggle all)',
  })

  if (selectedBranches.length === 0) {
    logger.warn('No branches selected. Skipping cherry-pick step.')
    return
  }
  logger.info(`Will process cherry-pick on: ${selectedBranches.join(', ')}`)

  // 2. 安全检查并保存状态
  await isRepositoryInSafeState(cwd)
  const originalBranch = await git.getCurrentBranch(cwd)

  const initialCommitHashes = toArray(commitHashes)

  const successfulBranches: string[] = []
  const failedBranches: { branch: string, reason: string }[] = []

  // 3. 循环处理用户选择的每一个分支
  for (const [i, branch] of selectedBranches.entries()) {
    try {
      logger.log(
        `\nProcessing branch: ${branch} (${i + 1}/${selectedBranches.length})`,
      )

      await prepareBranch(branch, remote, cwd)

      // 筛选出需要应用的 commit
      const hashesToPick = await filterCommitsToApply(
        initialCommitHashes,
        branch,
        cwd,
        patchIdCheckDepth,
      )
      if (hashesToPick.length === 0) {
        successfulBranches.push(`${branch} (no new changes)`)
        continue
      }

      // 调用核心流程处理 cherry-pick
      const hasChanges = await performCherryPickFlow({
        hashesToPick,
        globals,
      })

      // 推送变更
      if (shouldPush && hasChanges) {
        await git.gitPush(remote, branch, cwd)
      }
      successfulBranches.push(`${branch} (changes applied)`)
    }
    catch (error: any) {
      failedBranches.push({ branch, reason: error.message })
      // 尽力重置，以防影响下一个分支
      await git.gitReset(cwd).catch(() => {})
    }
  }

  await reportAndFinalizeStep({
    stepName: 'Cherry-Pick',
    successfulItems: successfulBranches,
    failedItems: failedBranches.map(f => ({
      item: f.branch,
      reason: f.reason,
    })),
    originalBranch,
    cwd,
  })
}
