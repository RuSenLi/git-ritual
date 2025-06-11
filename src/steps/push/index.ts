import type { PushStep } from './types'
import type { GitRitualGlobals } from '@/types'
import { note } from '@clack/prompts'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

export async function handlePush(step: PushStep, globals: GitRitualGlobals) {
  const { cwd } = globals
  const remote = step.with.remote ?? globals.remote ?? 'origin'

  const branchesToPush = Array.isArray(step.with.branches)
    ? step.with.branches
    : [step.with.branches]

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

  // 4. 所有分支处理完毕后，生成并打印总结报告
  const summaryParts: string[] = []
  if (successfulPushes.length > 0) {
    summaryParts.push(
      `✅ Successful branches:\n   - ${successfulPushes.join('\n   - ')}`,
    )
  }
  if (failedPushes.length > 0) {
    const failedSummary = failedPushes
      .map(f => `${f.branch}: ${f.reason}`)
      .join('\n   - ')
    summaryParts.push(`❌ Failed branches:\n   - ${failedSummary}`)
  }

  note(summaryParts.join('\n\n'), 'Push Step Summary')

  // 确保最后切回用户开始时的分支
  await git.gitCheckout(originalBranch, cwd)

  // 5. 如果有任何失败，则抛出最终错误，使整个步骤失败
  if (failedPushes.length > 0) {
    throw new Error(
      `Finished push step with ${failedPushes.length} failure(s).`,
    )
  }
}
