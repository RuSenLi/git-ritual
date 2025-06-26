import type { HasCommitStep } from './types'
import type { GitRitualGlobals } from '@/types'
import ansis from 'ansis'
import { reportAndFinalizeStep } from '@/steps/shared'
import {
  findAppliedHashesByPatchId,
  findCommitsByCriteria,
  toArray,
} from '@/steps/shared/finders'
import { selectBranchesToProcess } from '@/steps/shared/lifecycle'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

export async function handleHasCommit(
  step: HasCommitStep,
  globals: GitRitualGlobals,
) {
  const { cwd } = globals
  const { targetBranches, commitHashes, commitMessages, skipBranchSelection }
    = step.with

  const selectedBranches = await selectBranchesToProcess({
    targetBranches,
    skipBranchSelection,
    cwd,
    message:
      'Which branches to process for has-commit? (Press <a> to toggle all)',
  })

  const hashesToCheck = commitHashes ? toArray(commitHashes) : []
  const messagesToCheck = commitMessages ? toArray(commitMessages) : []

  logger.info(
    `Auditing commit existence on branches: ${selectedBranches.join(', ')}`,
  )
  const originalBranch = await git.getCurrentBranch(cwd)

  const successfulItems: string[] = []
  const failedItems: string[] = []

  const reportFormat = (
    titleLog: string,
    typeLog: string,
    resultLog: string,
  ): string => {
    return `${titleLog}\n${typeLog}\n  ${resultLog}`
  }

  for (const branch of selectedBranches) {
    // 尝试切换到分支，如果失败则记录并跳过
    try {
      await git.gitCheckout(branch, cwd)
    }
    catch {
      failedItems.push(
        '  (Skipped: Could not check out this branch. It may not exist locally.)',
      )
      continue
    }

    const titleLog = ansis.bold.underline(`\nBranch: ${branch}`)
    // 1. 如果配置了 commitHashes，则执行 HASH (patch-id) 检查
    if (hashesToCheck.length > 0) {
      const foundHashes = await findAppliedHashesByPatchId(
        hashesToCheck,
        branch,
        cwd,
      )

      const typeLog = '- Checking by Commit Hash (patch-id):'

      if (foundHashes.length > 0) {
        const resultLog = `✅ Found: ${foundHashes
          .map(h => h.substring(0, 7))
          .join(', ')}`
        const reportLog = reportFormat(titleLog, typeLog, resultLog)
        successfulItems.push(reportLog)
      }

      const notFoundHashes = hashesToCheck.filter(
        h => !foundHashes.includes(h),
      )
      if (notFoundHashes.length > 0) {
        const resultLog = `❌ Not Found: ${notFoundHashes
          .map(h => h.substring(0, 7))
          .join(', ')}`
        const reportLog = reportFormat(titleLog, typeLog, resultLog)
        failedItems.push(reportLog)
      }
    }

    // 2. 如果配置了 commitMessages，则执行元数据检查
    if (messagesToCheck.length > 0) {
      const foundCommits = await findCommitsByCriteria(
        messagesToCheck,
        branch,
        cwd,
      )

      const typeLog = '- Checking by Commit Message & Other Criteria:'

      if (foundCommits.length > 0) {
        const commitLog = Object.values(foundCommits)
          .map(
            commit =>
              `    - ${commit.hash.substring(0, 7)}: ${commit.message}`,
          )
          .join('\n')

        const resultLog = `✅ Found ${foundCommits.length} matching commit(s):\n${commitLog}`
        const reportLog = reportFormat(titleLog, typeLog, resultLog)
        successfulItems.push(reportLog)
      }
      else {
        const resultLog = `❌ No commits found matching the specified criteria.`
        failedItems.push(reportFormat(titleLog, typeLog, resultLog))
      }
    }
  }

  await reportAndFinalizeStep({
    stepName: 'Has-Commit',
    successfulItems,
    failedItems,
    originalBranch,
    cwd,
  })
}
