import type { GitError } from 'simple-git'
import type { GitRitualGlobals } from '@/types'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { promptForNextAction } from '@/utils/prompts'

export interface PerformCherryPickOptions {
  hashesToPick: string[]
  globals: GitRitualGlobals
}

type LogMsg = string | undefined

/**
 * @param options - 包含 hashesToPick 和 globals 的选项对象
 * @returns Promise<boolean> - 是否有新的 commit 被成功应用
 */
export async function performCherryPickFlow(
  options: PerformCherryPickOptions,
): Promise<[boolean, LogMsg]> {
  const { hashesToPick, globals } = options
  const { cwd } = globals
  let hasChanges = false
  let logMsg: LogMsg

  for (const hash of hashesToPick) {
    let isCommitHandled = false

    while (!isCommitHandled) {
      try {
        logger.info(
          `- Attempting to cherry-pick commit ${hash.substring(0, 7)}...`,
        )

        const headBefore = await git.getHeadHash(cwd)

        await git.gitCherryPick([hash], cwd)

        const headAfter = await git.getHeadHash(cwd)

        isCommitHandled = true

        if (headBefore !== headAfter) {
          hasChanges = true
          logger.success(
            `  Successfully picked ${hash.substring(
              0,
              7,
            )} and created a new commit.`,
          )
        }
        else {
          logger.info(
            `  No new commit was created, as the change from ${hash.substring(
              0,
              7,
            )} is already effectively present.`,
          )
        }
      }
      catch (e: any) {
        const error = e as GitError
        const errorMessage = error.message.toLowerCase()
        logger.error(`  Operation failed for commit ${hash.substring(0, 7)}.`)
        logger.warn(`  Reason: ${error.message}`)

        // Git 明确告知这是一个“空提交”（通常在冲突状态后），我们自动处理
        if (errorMessage.includes('the previous cherry-pick is now empty')) {
          logMsg = 'empty submission'
          logger.warn(
            '  Change is already present or conflict resolution resulted in an empty commit. Automatically skipping...',
          )
          await git.gitCherryPickSkip(cwd)
          isCommitHandled = true
          continue
        }

        // 这是一个需要交互处理的错误
        const isConflict
          = errorMessage.includes('conflict')
            || errorMessage.includes('could not apply')
        const resolution = await promptForNextAction({ isConflict })

        switch (resolution) {
          case 'continue':
            logMsg = 'user selected manually resolved the conflict'
            // 在尝试 --continue 之前，先检查状态
            if (git.isCherryPickInProgress(cwd)) {
              try {
                await git.gitCherryPickContinue(cwd)
                isCommitHandled = true
                hasChanges = true
                logger.success(`  Conflict resolved and continued.`)
              }
              catch (continueError: any) {
                const continueMessage = continueError.message.toLowerCase()
                logger.error('  Failed to "continue" the cherry-pick.')
                logger.warn(`  Reason: ${continueError.message}`)
                if (continueMessage.includes('empty')) {
                  logger.warn(
                    '  Conflict resolution resulted in an empty commit. Automatically skipping...',
                  )
                  await git.gitCherryPickSkip(cwd)
                  isCommitHandled = true
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
            }
            else {
              logger.info(
                '  It seems the cherry-pick was already resolved manually. Continuing...',
              )
              isCommitHandled = true
              hasChanges = true
            }
            break
          case 'skip':
            logMsg = 'user selected skip current branch'
            logger.warn(`  Skipping commit ${hash.substring(0, 7)}.`)
            await git.gitCherryPickAbort(cwd)
            isCommitHandled = true
            break
          case 'abort':
            logMsg = 'user selected abort all operations'
            await git.gitCherryPickAbort(cwd).catch(() => {})
            throw new Error('Operation aborted by user.')
          case 'retry':
            logMsg = 'user selected retry the last command'
            logger.info('  Retrying...')
            break
          default:
            logger.info('  Retrying...')
            break
        }
      }
    }
  }

  return [hasChanges, logMsg]
}
