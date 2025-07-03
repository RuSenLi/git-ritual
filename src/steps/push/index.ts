import type { PushStep } from './types'
import type { GitRitualGlobals } from '@/types'
import ansis from 'ansis'
import { reportAndFinalizeStep } from '@/steps/shared'
import { selectBranchesToProcess } from '@/steps/shared/lifecycle'
import * as git from '@/utils/git'
import { logger, logMessage } from '@/utils/logger'

export async function handlePush(step: PushStep, globals: GitRitualGlobals) {
  const { cwd } = globals
  const remote = step.with.remote ?? globals.remote ?? 'origin'

  const { targetBranches, skipBranchSelection } = step.with

  const selectedBranches = await selectBranchesToProcess({
    targetBranches,
    skipBranchSelection,
    cwd,
    message: 'Which branches to process for push? (Press <a> to toggle all)',
  })

  logger.info(
    `Starting push step for branches: ${selectedBranches.join(', ')}`,
  )
  const originalBranch = await git.getCurrentBranch(cwd)

  // 1. 初始化成功和失败的列表
  const successfulItems: string[] = []
  const failedItems: string[] = []
  const warnItems: string[] = []
  const spacesStr = ' '.repeat(4)

  // 2. 遍历所有要推送的分支
  for (const branch of selectedBranches) {
    const branchLog = ansis.bold(`${branch}`)

    try {
      logMessage(`\nProcessing branch: ${branch}`)
      await git.gitCheckout(branch, cwd)

      // 如果是纯本地分支，直接推送
      if (!(await git.isBranchTracked(branch, cwd))) {
        await git.gitPush(remote, branch, cwd)
        successfulItems.push(`${spacesStr}- ${branchLog}`)
        continue
      }

      // 如果是已追踪分支，检查状态
      await git.gitFetch(remote, branch, cwd)
      const status = await git.getBranchUpstreamStatus(cwd)

      if (status.behind > 0) {
        throw new Error(
          `Branch is ${status.behind} commit(s) behind remote. Please pull/rebase first.`,
        )
      }
      else if (status.ahead === 0) {
        logger.info(
          `Branch "${branch}" is already up-to-date. Nothing to push.`,
        )
        // 我们可以将“无需推送”也视为一种广义的“成功”
        successfulItems.push(`${spacesStr}- ⚠️ ${branchLog} (up-to-date)`)
        warnItems.push(`${spacesStr}- ${branchLog} (up-to-date)`)
      }
      else {
        await git.gitPush(remote, branch, cwd)
        successfulItems.push(`${spacesStr}- ${branchLog}`)
      }
    }
    catch (error: any) {
      // 3. 如果当前分支处理失败，记录下来并继续处理下一个
      failedItems.push(`${spacesStr}- ${branchLog}: ${error.message}`)
    }
  }

  await reportAndFinalizeStep({
    stepName: 'Push',
    successfulItems,
    failedItems,
    warnItems,
    originalBranch,
    cwd: globals.cwd,
  })
}
