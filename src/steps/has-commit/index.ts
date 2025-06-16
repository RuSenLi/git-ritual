import type { HasCommitStep } from './types'
import type { GitRitualGlobals } from '@/types'
import { note } from '@clack/prompts'
import ansis from 'ansis'
import {
  findAppliedHashesByPatchId,
  findCommitsByCriteria,
  resolveTargetBranches,
} from '@/steps/shared/finders'
import { safeCheckoutOriginalBranch } from '@/steps/shared/lifecycle'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

export async function handleHasCommit(
  step: HasCommitStep,
  globals: GitRitualGlobals,
) {
  const { cwd } = globals
  const { targetBranches, commitHashes, commitMessages } = step.with

  const branchesToCheck = await resolveTargetBranches({
    targetBranches,
    cwd,
  })
  const hashesToCheck = commitHashes
    ? Array.isArray(commitHashes)
      ? commitHashes
      : [commitHashes]
    : []
  const messagesToCheck = commitMessages
    ? Array.isArray(commitMessages)
      ? commitMessages
      : [commitMessages]
    : []

  logger.info(
    `Auditing commit existence on branches: ${branchesToCheck.join(', ')}`,
  )
  const originalBranch = await git.getCurrentBranch(cwd)

  const summaryLines: string[] = []

  for (const branch of branchesToCheck) {
    summaryLines.push(ansis.bold.underline(`\nBranch: ${branch}`))

    // 尝试切换到分支，如果失败则记录并跳过
    try {
      await git.gitCheckout(branch, cwd)
    }
    catch {
      summaryLines.push(
        ansis.yellow(
          '  (Skipped: Could not check out this branch. It may not exist locally.)',
        ),
      )
      continue
    }

    // 1. 如果配置了 commitHashes，则执行 HASH (patch-id) 检查
    if (hashesToCheck.length > 0) {
      summaryLines.push('- Checking by Commit Hash (patch-id):')
      const foundHashes = await findAppliedHashesByPatchId(
        hashesToCheck,
        branch,
        cwd,
      )

      if (foundHashes.length > 0) {
        summaryLines.push(
          ansis.green(
            `  ✅ Found: ${foundHashes
              .map(h => h.substring(0, 7))
              .join(', ')}`,
          ),
        )
      }

      const notFoundHashes = hashesToCheck.filter(
        h => !foundHashes.includes(h),
      )
      if (notFoundHashes.length > 0) {
        summaryLines.push(
          ansis.red(
            `  ❌ Not Found: ${notFoundHashes
              .map(h => h.substring(0, 7))
              .join(', ')}`,
          ),
        )
      }
    }

    // 2. 如果配置了 commitMessages，则执行元数据检查
    if (messagesToCheck.length > 0) {
      summaryLines.push('- Checking by Commit Message & Other Criteria:')
      const foundCommits = await findCommitsByCriteria(
        messagesToCheck,
        branch,
        cwd,
      )

      if (foundCommits.length > 0) {
        summaryLines.push(
          ansis.green(`  ✅ Found ${foundCommits.length} matching commit(s):`),
        )
        for (const commit of foundCommits) {
          summaryLines.push(
            ansis.dim(`    - ${commit.hash.substring(0, 7)}: ${commit.message}`),
          )
        }
      }
      else {
        summaryLines.push(
          ansis.red('  ❌ No commits found matching the specified criteria.'),
        )
      }
    }
  }

  // 3. 打印最终的审计报告
  note(summaryLines.join('\n'), 'Has-Commit Audit Report')

  // 4. 收尾工作
  await safeCheckoutOriginalBranch(originalBranch, globals.cwd)
  logger.success('🎉 Has-commit step completed successfully!')
}
