import type { CherryPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import ansis from 'ansis'
import { performCherryPickFlow, reportAndFinalizeStep } from '@/steps/shared'
import { filterCommitsToApply, toArray } from '@/steps/shared/finders'
import {
  isRepositoryInSafeState,
  prepareBranch,
  selectBranchesToProcess,
} from '@/steps/shared/lifecycle'
import * as git from '@/utils/git'
import { logger, logMessage } from '@/utils/logger'
import { resolveValue } from '../shared/resolveValue'

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
  const {
    targetBranches,
    commitHashes,
    skipBranchSelection,
    remote: withRemote,
    push: withPush,
  } = await resolveValue(step.with)
  const remote = withRemote ?? globals.remote ?? 'origin'
  const shouldPush = withPush ?? globals.push ?? false

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

  const successfulItems: string[] = []
  const failedItems: string[] = []
  const warnItems: string[] = []
  const spacesStr = ' '.repeat(4)

  // 3. 循环处理用户选择的每一个分支
  for (const [i, branch] of selectedBranches.entries()) {
    const branchLog = ansis.bold(`${branch}`)

    try {
      logMessage(
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
        successfulItems.push(`${spacesStr}- 🕊️ ${branchLog} (no new changes)`)
        continue
      }

      // 调用核心流程处理 cherry-pick
      const [hasChanges, logMsg] = await performCherryPickFlow({
        hashesToPick,
        globals,
      })

      // 推送变更
      if (shouldPush && hasChanges) {
        await git.gitPush(remote, branch, cwd)
      }
      if (logMsg) {
        successfulItems.push(`${spacesStr}- ⚠️ ${branchLog} (${logMsg})`)
      }
      else {
        successfulItems.push(`${spacesStr}- ${branchLog} (changes applied)`)
      }

      if (logMsg) {
        warnItems.push(`${spacesStr}- ${branchLog}: ${logMsg}`)
      }
    }
    catch (error: any) {
      failedItems.push(`${spacesStr}- ${branchLog}: ${error.message}`)
      // 尽力重置，以防影响下一个分支
      await git.gitReset(cwd).catch(() => {})
    }
  }

  await reportAndFinalizeStep({
    stepName: 'Cherry-Pick',
    successfulItems,
    failedItems,
    warnItems,
    originalBranch,
    cwd,
  })
}
