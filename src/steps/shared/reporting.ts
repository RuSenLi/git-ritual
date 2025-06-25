import boxen from 'boxen'
import { safeCheckoutOriginalBranch } from '@/steps/shared/lifecycle'
import { logger, logToFileOnly } from '@/utils/logger'

interface ReportOptions {
  stepName: string
  successfulItems: string[]
  failedItems: string[]
  originalBranch: string
  cwd: string
}

/**
 * 打印总结报告（终端美观输出+日志文件记录）并切换回原始分支
 * @param options
 */
export async function reportAndFinalizeStep(options: ReportOptions) {
  const { stepName, successfulItems, failedItems, originalBranch, cwd }
    = options

  // 1. 构建总结报告内容
  const summaryParts: string[] = []
  if (successfulItems.length > 0) {
    summaryParts.push(
      `✅ Successful items:\n${successfulItems.join('\n')}`,
    )
  }
  if (failedItems.length > 0) {
    summaryParts.push(`❌ Failed items:\n${failedItems.join('\n')}`)
  }

  // 2. 终端美观输出 + 日志文件记录
  if (summaryParts.length > 0) {
    const report = summaryParts.join('\n\n')
    // 日志文件记录（不输出到终端）
    logToFileOnly(`${stepName} Step Summary\n${report}`)
    // 终端美观输出
    console.log(
      boxen(report, {
        title: `${stepName} Step Summary`,
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: failedItems.length > 0 ? 'red' : 'green',
      }),
    )
  }

  // 3. 切换回原始分支
  logger.info(
    `\nStep finished. Switching back to original branch "${originalBranch}".`,
  )
  await safeCheckoutOriginalBranch(originalBranch, cwd)

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
