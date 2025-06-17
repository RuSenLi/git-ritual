import type { TargetBranches } from '@/types'
import fs from 'node:fs'
import path from 'node:path'
import {
  getGit,
  gitCheckout,
  gitFetch,
  gitPull,
  isBranchTracked,
} from '@/utils/git'
import { logger } from '@/utils/logger'
import { promptForMultiSelect } from '@/utils/prompts'
import { resolveTargetBranches } from './finders'

// 这个文件将专门存放所有与“步骤生命周期和状态管理”相关的函数。

interface SelectionOptions {
  targetBranches: TargetBranches
  skipBranchSelection?: boolean
  cwd: string
  message: string
}

/**
 * 分支选择器
 * @param options - 选项对象
 * @returns Promise<string[]> - 用户最终确认要处理的分支列表
 */
export async function selectBranchesToProcess(
  options: SelectionOptions,
): Promise<string[]> {
  const { targetBranches, skipBranchSelection, cwd, message } = options

  const resolvedBranches = await resolveTargetBranches({
    targetBranches,
    cwd,
  })

  if (resolvedBranches.length === 0) {
    logger.warn(
      'No target branches found matching the provided configuration.',
    )
    return []
  }

  if (skipBranchSelection) {
    logger.info('Branch selection prompt skipped as per configuration.')
    return resolvedBranches // 直接返回所有解析出的分支
  }

  const selectedBranches = await promptForMultiSelect(
    message,
    resolvedBranches.map(b => ({ value: b, label: b })),
  )

  return selectedBranches
}

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

/**
 * 切换分支并更新状态
 * @param branch - 要切换的分支名
 * @param remote - 远程仓库名
 * @param cwd - 工作目录
 */
export async function prepareBranch(
  branch: string,
  remote: string,
  cwd: string,
) {
  await gitCheckout(branch, cwd)

  if (await isBranchTracked(branch, cwd)) {
    await gitFetch(remote, branch, cwd)
    await gitPull(remote, branch, cwd)
  }
}
