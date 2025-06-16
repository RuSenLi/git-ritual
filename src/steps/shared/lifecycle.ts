import fs from 'node:fs'
import path from 'node:path'
import { getGit, gitCheckout } from '@/utils/git'
import { logger } from '@/utils/logger'

// 这个文件将专门存放所有与“步骤生命周期和状态管理”相关的函数。

export async function isRepositoryInSafeState(cwd: string): Promise<boolean> {
  const status = await getGit(cwd).status()
  if (!status.isClean()) {
    logger.error(
      'Workspace is not clean. Please commit or stash your changes.',
    )
    return false
  }

  const gitDir = path.join(cwd, '.git')
  const stateFiles = [
    'CHERRY_PICK_HEAD',
    'MERGE_HEAD',
    'REBASE_HEAD',
    'REVERT_HEAD',
  ]
  for (const file of stateFiles) {
    if (fs.existsSync(path.join(gitDir, file))) {
      logger.error(
        `Repository is in the middle of a "${file.split('_')[0]}" operation.`,
      )
      logger.warn(
        'Please resolve or abort the existing operation before running the script.',
      )
      return false
    }
  }
  return true
}

/**
 * 安全地切换回操作开始前的原始分支
 * @param originalBranch - 脚本开始时用户所在的分支
 * @param cwd - 工作目录
 */
export async function safeCheckoutOriginalBranch(
  originalBranch: string,
  cwd: string,
) {
  try {
    logger.info(
      `\nStep finished. Switching back to original branch "${originalBranch}".`,
    )
    await gitCheckout(originalBranch, cwd)
  }
  catch (e: any) {
    logger.warn(
      `⚠️  Warning: All tasks completed, but failed to switch back to the original branch "${originalBranch}". Please switch manually.`,
    )
    logger.warn(`   Reason: ${e.message}`)
  }
}
