import type { PushStep } from './types'
import type { GitRitualGlobals } from '@/types'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { reportAndFinalizeStep } from '@/utils/summary'

export async function handlePush(step: PushStep, globals: GitRitualGlobals) {
  const { cwd } = globals
  const remote = step.with.remote ?? globals.remote ?? 'origin'

  const branchesToPush = Array.isArray(step.with.targetBranches)
    ? step.with.targetBranches
    : [step.with.targetBranches]

  logger.info(`Starting push step for branches: ${branchesToPush.join(', ')}`)
  const originalBranch = await git.getCurrentBranch(cwd)

  // 1. 初始化成功和失败的列表
  const successfulPushes: string[] = []
  const failedPushes: { branch: string, reason: string }[] = []

  // 2. 遍历所有要推送的分支
  for (const branch of branchesToPush) {
    try {
      logger.log(`\nProcessing branch: ${branch}`)
      await git.gitCheckout(branch, cwd)

      // 如果是纯本地分支，直接推送
      if (!(await git.isBranchTracked(branch, cwd))) {
        await git.gitPush(remote, branch, cwd)
        successfulPushes.push(branch)
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
        successfulPushes.push(`${branch} (up-to-date)`)
      }
      else {
        await git.gitPush(remote, branch, cwd)
        successfulPushes.push(branch)
      }
    }
    catch (error: any) {
      // 3. 如果当前分支处理失败，记录下来并继续处理下一个
      failedPushes.push({ branch, reason: error.message })
    }
  }

  await reportAndFinalizeStep({
    stepName: 'Push',
    successfulItems: successfulPushes,
    failedItems: failedPushes.map(f => ({
      item: f.branch,
      reason: f.reason,
    })),
    originalBranch,
    cwd: globals.cwd,
  })
}
