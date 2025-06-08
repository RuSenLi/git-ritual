// src/steps/cherry-pick.ts

import type { GitError } from 'simple-git'
import type { CherryPickStep, GitRitualGlobals } from '../types/options'
import * as git from '../utils/git'
import { logger } from '../utils/logger'
import { promptForMultiSelect, promptForNextAction } from '../utils/prompts'

export async function handleCherryPick(
  step: CherryPickStep,
  globals: GitRitualGlobals,
) {
  const { cwd } = globals

  // 1. 从配置中获取初始分支列表
  const initialTargetBranches = Array.isArray(step.with.targetBranches)
    ? step.with.targetBranches
    : [step.with.targetBranches]

  const branchOptions = initialTargetBranches.map(branch => ({
    value: branch,
    label: branch,
  }))

  // 2. 让用户从列表中选择要处理的分支
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

  // 安全检查
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

  // 使用用户选择的 `selectedBranches` 进行循环
  for (let i = 0; i < selectedBranches.length; i++) {
    const branch = selectedBranches[i]
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

      const hashesToPick: string[] = []
      logger.info('Checking which changes need to be applied...')
      for (const hash of initialCommitHashes) {
        if (!(await git.isChangeApplied(hash, branch, cwd))) {
          hashesToPick.push(hash)
        }
        else {
          logger.log(
            `- Change from commit ${hash.substring(
              0,
              7,
            )} already applied. Skipping.`,
          )
        }
      }

      if (hashesToPick.length === 0) {
        logger.success(
          `All changes already applied on branch "${branch}". Nothing to do.`,
        )
        continue
      }

      for (const hash of hashesToPick) {
        let isCommitHandled = false
        while (!isCommitHandled) {
          try {
            logger.info(
              `- Attempting to cherry-pick commit ${hash.substring(0, 7)}...`,
            )
            await git.gitCherryPick([hash], cwd)
            isCommitHandled = true
            logger.success(`  Successfully picked ${hash.substring(0, 7)}.`)
          }
          catch (e: any) {
            const error = e as GitError
            const errorMessage = error.message.toLowerCase()
            logger.error(
              `  Operation failed for commit ${hash.substring(0, 7)}.`,
            )
            logger.warn(`  Reason: ${error.message}`)

            const isConflict
              = errorMessage.includes('conflict')
                || errorMessage.includes('unmerged')

            // 同样使用 `selectedBranches` 来获取下一个分支名
            const nextBranchName = selectedBranches[i + 1]
            const resolution = await promptForNextAction({
              isConflict,
              nextActionName: shouldPush ? `git push` : 'finish this commit',
              nextBranchName,
            })

            switch (resolution) {
              case 'continue':
                try {
                  await git.gitCherryPickContinue(cwd)
                  isCommitHandled = true
                  logger.success(`  Conflict resolved and continued.`)
                }
                catch (continueError: any) {
                  const continueMessage = continueError.message.toLowerCase()
                  if (continueMessage.includes('empty')) {
                    logger.warn(
                      '  Conflict resolution resulted in an empty commit. Automatically skipping...',
                    )
                    await git.gitCherryPickSkip(cwd)
                    isCommitHandled = true
                  }
                  else {
                    logger.error('  Failed to "continue" the cherry-pick.')
                    logger.warn(`  Reason: ${continueError.message}`)
                    if (continueMessage.includes('unmerged files')) {
                      logger.warn(
                        '  Hint: Did you forget to run \'git add <files>\' after resolving?',
                      )
                    }
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

      if (shouldPush && hashesToPick.length > 0) {
        await git.gitPush(remote, branch, cwd)
      }
    }
    catch (error: any) {
      logger.error(`An unrecoverable error occurred on branch "${branch}".`)
      await git.gitCheckout(originalBranch, cwd).catch(() => {})
      throw error
    }
  }

  logger.info(
    `\nAll tasks finished. Switching back to original branch "${originalBranch}".`,
  )
  await git.gitCheckout(originalBranch, cwd)
}
