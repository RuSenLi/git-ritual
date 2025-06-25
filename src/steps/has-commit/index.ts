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

    // 1. 如果配置了 commitHashes，则执行 HASH (patch-id) 检查
    if (hashesToCheck.length > 0) {
      const foundHashes = await findAppliedHashesByPatchId(
        hashesToCheck,
        branch,
        cwd,
      )

      if (foundHashes.length > 0) {
        successfulItems.push(ansis.bold.underline(`\nBranch: ${branch}`))
        successfulItems.push('- Checking by Commit Hash (patch-id):')
        successfulItems.push(
          `  ✅ Found: ${foundHashes.map(h => h.substring(0, 7)).join(', ')}`,
        )
      }

      const notFoundHashes = hashesToCheck.filter(
        h => !foundHashes.includes(h),
      )
      if (notFoundHashes.length > 0) {
        failedItems.push(ansis.bold.underline(`\nBranch: ${branch}`))
        failedItems.push('- Checking by Commit Hash (patch-id):')
        failedItems.push(
          `  ❌ Not Found: ${notFoundHashes
            .map(h => h.substring(0, 7))
            .join(', ')}`,
        )
      }
    }

    // 2. 如果配置了 commitMessages，则执行元数据检查
    if (messagesToCheck.length > 0) {
      const foundCommits = await findCommitsByCriteria(
        messagesToCheck,
        branch,
        cwd,
      )

      if (foundCommits.length > 0) {
        successfulItems.push(ansis.bold.underline(`\nBranch: ${branch}`))
        successfulItems.push('- Checking by Commit Message & Other Criteria:')
        successfulItems.push(
          `  ✅ Found ${foundCommits.length} matching commit(s):`,
        )
        for (const commit of foundCommits) {
          successfulItems.push(
            ansis.dim(`    - ${commit.hash.substring(0, 7)}: ${commit.message}`),
          )
        }
      }
      else {
        failedItems.push(ansis.bold.underline(`\nBranch: ${branch}`))
        failedItems.push('- Checking by Commit Message & Other Criteria:')
        failedItems.push(
          '  ❌ No commits found matching the specified criteria.',
        )
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
