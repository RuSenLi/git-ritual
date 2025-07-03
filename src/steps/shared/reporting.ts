import type { Options } from 'boxen'
import ansis from 'ansis'
import boxen from 'boxen'
import { safeCheckoutOriginalBranch } from '@/steps/shared/lifecycle'
import { logger, logToFileOnly } from '@/utils/logger'

interface ReportOptions {
  stepName: string
  successfulItems?: string[]
  warnItems?: string[]
  failedItems?: string[]
  originalBranch: string
  cwd: string
}

export function reportBoxen(text: string, options?: Options) {
  const { title } = options ?? {}

  console.log(
    boxen(text, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      ...options,
    }),
  )
  logToFileOnly(`${title ? `${title}\n` : ''}${text}`)
}

/**
 * 打印总结报告（终端美观输出+日志文件记录）并切换回原始分支
 * @param options
 */
export async function reportAndFinalizeStep(options: ReportOptions) {
  const {
    stepName,
    successfulItems,
    warnItems,
    failedItems,
    originalBranch,
    cwd,
  } = options

  // 1. 构建总结报告内容
  if (successfulItems?.length) {
    const title = `✅  ${stepName} Step Successful Summary with ${ansis.green.bold(successfulItems.length)} items:`
    const report = `${title}\n${successfulItems.join('\n')}`

    reportBoxen(report, {
      borderColor: 'green',
    })
  }

  if (warnItems?.length) {
    const title = `⚠️  ${stepName} Step warning Summary with ${ansis.yellow.bold(warnItems.length)} items:`
    const report = `${title}\n${warnItems.join('\n')}`

    reportBoxen(report, {
      borderColor: 'yellow',
    })
  }

  if (failedItems?.length) {
    const title = `❌  ${stepName} Step error Summary with ${ansis.red.bold(failedItems.length)} items:`
    const report = `${title}\n${failedItems.join('\n')}`
    reportBoxen(report, {
      borderColor: 'red',
    })
  }

  // 3. 切换回原始分支
  await safeCheckoutOriginalBranch(originalBranch, cwd)

  // 4. 如果有任何失败，则抛出最终错误
  if (failedItems?.length) {
    logger.error(
      `Finished ${stepName} step with ${failedItems.length} failure(s).`,
    )
  }
  else {
    logger.success(`🎉 ${stepName} step completed successfully!`)
  }
}
