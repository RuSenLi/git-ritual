import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

/**
 * 筛选出尚未被应用到目标分支的 commit
 */
export async function filterCommitsToApply(
  commitHashes: string[],
  branch: string,
  cwd: string,
): Promise<string[]> {
  logger.info(`Checking which changes need to be applied on "${branch}"...`)
  const hashesToPick: string[] = []
  for (const hash of commitHashes) {
    if (!(await git.isChangeApplied(hash, branch, cwd))) {
      hashesToPick.push(hash)
      logger.log(
        `- Change from commit ${hash.substring(0, 7)} needs to be applied.`,
      )
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
  return hashesToPick
}
