import { note } from '@clack/prompts'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

interface ReportOptions {
  stepName: string
  successfulItems: string[]
  failedItems: { item: string, reason: string }[]
  originalBranch: string
  cwd: string
}

/**
 * 打印总结报告
 * @param options
 */
export async function reportAndFinalizeStep(options: ReportOptions) {
  const { stepName, successfulItems, failedItems, originalBranch, cwd }
    = options

  // 1. 构建总结报告的内容
  const summaryParts: string[] = []
  if (successfulItems.length > 0) {
    summaryParts.push(
      `✅ Successful items:\n   - ${successfulItems.join('\n   - ')}`,
    )
  }
  if (failedItems.length > 0) {
    const failedSummary = failedItems
      .map(f => `${f.item}: ${f.reason}`)
      .join('\n   - ')
    summaryParts.push(`❌ Failed items:\n   - ${failedSummary}`)
  }

  // 2. 打印报告
  if (summaryParts.length > 0) {
    note(summaryParts.join('\n\n'), `${stepName} Step Summary`)
  }

  // 3. 切换回原始分支
  logger.info(
    `\nStep finished. Switching back to original branch "${originalBranch}".`,
  )

  try {
    logger.info(
      `\nStep finished. Switching back to original branch "${originalBranch}".`,
    )
    await git.gitCheckout(originalBranch, cwd)
  }
  catch (e: any) {
    logger.warn(
      `⚠️  Warning: All tasks completed, but failed to switch back to the original branch "${originalBranch}". Please switch manually.`,
    )
    logger.warn(`   Reason: ${e.message}`)
  }

  // 4. 如果有任何失败，则抛出最终错误，使整个步骤状态为失败
  if (failedItems.length > 0) {
    throw new Error(
      `Finished ${stepName} step with ${failedItems.length} failure(s).`,
    )
  }
  else {
    logger.success(`🎉 ${stepName} step completed successfully!`)
  }
}
