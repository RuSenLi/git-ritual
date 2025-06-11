import type { CherryPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { reportAndFinalizeStep } from '@/utils/summary'
import {
  type BranchProcessingContext,
  ensureRepoSafe,
  getCommitHashes,
  getTargetBranches,
  processBranch,
  promptForBranches,
} from './helpers'

export async function handleCherryPick(
  step: CherryPickStep,
  globals: GitRitualGlobals,
) {
  const targetBranches = getTargetBranches(step)
  const selectedBranches = await promptForBranches(targetBranches)

  if (selectedBranches.length === 0) {
    logger.warn('No branches selected. Exiting step.')
    return
  }
  logger.info(
    `Will process the following branches: ${selectedBranches.join(', ')}`,
  )

  // 执行前置安全检查，确保 Git 仓库工作区干净且不处于任何中间状态（如合并、变基中）
  await ensureRepoSafe(globals.cwd)

  // 保存用户执行脚本前的原始分支，以便在所有操作结束后安全地切回
  const originalBranch = await git.getCurrentBranch(globals.cwd)

  // 子函数的共享变量和配置
  const context: BranchProcessingContext = {
    commitHashes: getCommitHashes(step),
    remote: step.with.remote ?? globals.remote ?? 'origin',
    shouldPush: step.with.push ?? globals.push ?? false,
    cwd: globals.cwd,
    globals,
  }

  const successfulBranches: string[] = []
  const failedBranches: { branch: string, reason: string }[] = []

  for (const [i, branch] of selectedBranches.entries()) {
    try {
      logger.log(
        `\nProcessing branch: ${branch} (${i + 1}/${selectedBranches.length})`,
      )
      const hasChanges = await processBranch(branch, context)
      if (hasChanges) {
        successfulBranches.push(`${branch} (changes applied)`)
      }
      else {
        successfulBranches.push(`${branch} (no new changes)`)
      }
    }
    catch (error: any) {
      failedBranches.push({ branch, reason: error.message })
      await git.gitReset(context.cwd).catch(() => {})
    }
  }

  await reportAndFinalizeStep({
    stepName: 'Cherry-Pick',
    successfulItems: successfulBranches.map(b =>
      b.replace(' (no new changes)', ''),
    ),
    failedItems: failedBranches.map(f => ({
      item: f.branch,
      reason: f.reason,
    })),
    originalBranch,
    cwd: context.cwd,
  })
}
