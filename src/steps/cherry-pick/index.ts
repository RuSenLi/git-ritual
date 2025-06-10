import type { GitError } from 'simple-git'
import type { CherryPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { promptForMultiSelect, promptForNextAction } from '@/utils/prompts'

export async function handleCherryPick(
  step: CherryPickStep,
  globals: GitRitualGlobals,
) {
  const { cwd } = globals

  // 1. 分支选择
  const initialTargetBranches = Array.isArray(step.with.targetBranches)
    ? step.with.targetBranches
    : [step.with.targetBranches]
  const branchOptions = initialTargetBranches.map(branch => ({
    value: branch,
    label: branch,
  }))
  const selectedBranches = await promptForMultiSelect(
    'Which branches to process? (Press <space> to toggle, <a> to toggle all, <enter> to submit)',
    branchOptions,
  )

  if (selectedBranches.length === 0) {
    logger.warn('No branches selected. Exiting step.')
    return
  }
  logger.info(
    `Will process the following branches: ${selectedBranches.join(', ')}`,
  )

  const originalBranch = await git.getCurrentBranch(cwd)

  // 2. 安全检查
  logger.info('Performing pre-flight safety checks...')
  if (!(await git.isRepositoryInSafeState(cwd))) {
    throw new Error(
      'Pre-flight safety check failed. Please clean up your repository state.',
    )
  }
  logger.success('Safety checks passed. Proceeding...')

  const initialCommitHashes = Array.isArray(step.with.commitHashes)
    ? step.with.commitHashes
    : [step.with.commitHashes]
  const remote = step.with.remote ?? globals.remote ?? 'origin'
  const shouldPush = step.with.push ?? globals.push ?? false

  // 3. 外层循环：处理分支
  for (let i = 0; i < selectedBranches.length; i++) {
    const branch = selectedBranches[i]
    let branchHasChanges = false
    logger.log(
      `\nProcessing branch: ${branch} (${i + 1}/${selectedBranches.length})`,
    )

    try {
      // 准备分支环境
      if (await git.isBranchTracked(branch, cwd))
        await git.gitFetch(remote, branch, cwd)
      await git.gitCheckout(branch, cwd)
      if (await git.isBranchTracked(branch, cwd))
        await git.gitPull(remote, branch, cwd)

      const hashesToPick = []
      // 筛选 commits
      logger.info('Checking which changes need to be applied...')
      for (const hash of initialCommitHashes) {
        if (!(await git.isChangeApplied(hash, branch, cwd))) {
          hashesToPick.push(hash)
          logger.log(
            `- Change from commit ${hash.substring(0, 7)} needs to be applied.`,
          )
        }
      }

      if (hashesToPick.length === 0) {
        logger.success(
          `All changes already applied on branch "${branch}". Nothing to do.`,
        )
        continue
      }

      // 4. 内层循环：逐个处理 commit
      for (const hash of hashesToPick) {
        let isCommitHandled = false
        while (!isCommitHandled) {
          try {
            logger.info(
              `- Attempting to cherry-pick commit ${hash.substring(0, 7)}...`,
            )
            await git.gitCherryPick([hash], cwd)
            isCommitHandled = true
            branchHasChanges = true
            logger.success(`  Successfully picked ${hash.substring(0, 7)}.`)
          }
          catch (e: any) {
            const error = e as GitError
            logger.error(
              `  Operation failed for commit ${hash.substring(0, 7)}.`,
            )
            logger.warn(`  Reason: ${error.message}`)

            const isConflict = error.message.toLowerCase().includes('conflict')
            const resolution = await promptForNextAction({
              isConflict,
              nextActionName: shouldPush ? `git push` : 'finish this commit',
              nextBranchName: selectedBranches[i + 1],
            })

            switch (resolution) {
              case 'continue':
                try {
                  await git.gitCherryPickContinue(cwd)
                  isCommitHandled = true
                  branchHasChanges = true
                  logger.success(`  Conflict resolved and continued.`)
                }
                catch (continueError: any) {
                  const continueMessage = continueError.message.toLowerCase()
                  logger.error(`  Failed to "continue" the cherry-pick.`)
                  logger.warn(`  Reason: ${continueError.message}`)
                  if (
                    continueMessage.includes(
                      'the previous cherry-pick is now empty',
                    )
                  ) {
                    logger.warn(
                      '  Conflict resolution resulted in an empty commit. Automatically skipping...',
                    )
                    await git.gitCherryPickSkip(cwd)
                    isCommitHandled = true // 跳过也算成功处理
                  }
                  else if (continueMessage.includes('unmerged files')) {
                    logger.warn(
                      '  Hint: Did you forget to run \'git add <files>\' after resolving? Please try again.',
                    )
                  }
                  else {
                    await git.gitCherryPickAbort(cwd).catch(() => {})
                    throw continueError
                  }
                }
                break
              case 'retry':
                logger.info('  Retrying...')
                break
              case 'skip':
                logger.warn(
                  `  Skipping commit ${hash.substring(
                    0,
                    7,
                  )} on branch "${branch}".`,
                )
                await git.gitCherryPickAbort(cwd)
                isCommitHandled = true
                break
              case 'abort':
                await git.gitCherryPickAbort(cwd).catch(() => {})
                throw new Error('Operation aborted by user.')
            }
          }
        }
      }

      // 只有在当前分支确实发生了变更时才执行 push
      if (shouldPush && branchHasChanges) {
        await git.gitPush(remote, branch, cwd)
      }
    }
    catch (error: any) {
      logger.error(
        `An unrecoverable error occurred on branch "${branch}". Aborting all tasks.`,
      )
      await git.gitCheckout(originalBranch, cwd).catch(() => {})
      throw error
    }
  }

  logger.info(
    `\nAll tasks finished. Switching back to original branch "${originalBranch}".`,
  )
  await git.gitCheckout(originalBranch, cwd)
}
