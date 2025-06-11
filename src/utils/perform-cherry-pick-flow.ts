import type { GitError } from 'simple-git'
import type { GitRitualGlobals } from '@/types'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { promptForNextAction } from '@/utils/prompts'

interface PerformCherryPickOptions {
  hashesToPick: string[]
  globals: GitRitualGlobals
}

/**
 * Cherry-Pick 的核心流程
 * 负责在当前分支应用 commit，并返回是否发生了变更。
 * @returns Promise<boolean> - 是否有新的 commit 被成功应用
 */
export async function performCherryPickFlow(
  options: PerformCherryPickOptions,
): Promise<boolean> {
  const { hashesToPick, globals } = options
  const { cwd } = globals
  let hasChanges = false

  for (const hash of hashesToPick) {
    let isCommitHandled = false
    while (!isCommitHandled) {
      try {
        logger.info(
          `- Attempting to cherry-pick commit ${hash.substring(0, 7)}...`,
        )
        await git.gitCherryPick([hash], cwd)
        isCommitHandled = true
        hasChanges = true // 标记发生了变更
        logger.success(`  Successfully picked ${hash.substring(0, 7)}.`)
      }
      catch (e: any) {
        const error = e as GitError
        logger.error(`  Operation failed for commit ${hash.substring(0, 7)}.`)
        logger.warn(`  Reason: ${error.message}`)

        const isConflict = error.message.toLowerCase().includes('conflict')
        const resolution = await promptForNextAction({ isConflict })

        switch (resolution) {
          case 'continue':
            try {
              await git.gitCherryPickContinue(cwd)
              isCommitHandled = true
              hasChanges = true
            }
            catch (continueError: any) {
              if (continueError.message.toLowerCase().includes('empty')) {
                await git.gitCherryPickSkip(cwd)
                isCommitHandled = true
              }
              else {
                logger.error(
                  'Failed to continue, please resolve and try again.',
                )
              }
            }
            break
          case 'skip':
            await git.gitCherryPickAbort(cwd)
            isCommitHandled = true
            break
          case 'abort':
            await git.gitCherryPickAbort(cwd).catch(() => {})
            throw new Error('Operation aborted by user.')
          case 'retry':
          default:
            logger.info('  Retrying...')
            break
        }
      }
    }
  }

  return hasChanges
}
