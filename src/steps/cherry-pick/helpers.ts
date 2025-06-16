import type { CherryPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import { performCherryPickFlow } from '@/steps/shared/perform-cherry-pick-flow'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { promptForMultiSelect } from '@/utils/prompts'
import { filterCommitsToApply } from '../shared/finders'
import { isRepositoryInSafeState } from '../shared/lifecycle'

export interface BranchProcessingContext {
  commitHashes: string[]
  remote: string
  shouldPush: boolean
  cwd: string
  globals: GitRitualGlobals
}

/**
 * 集中处理单个分支
 */
export async function processBranch(
  branch: string,
  context: BranchProcessingContext,
): Promise<boolean> {
  const { commitHashes, remote, cwd, globals, shouldPush } = context

  await prepareBranch(branch, remote, cwd)
  const hashesToPick = await filterCommitsToApply(commitHashes, branch, cwd)

  if (hashesToPick.length === 0) {
    logger.success(
      `All changes already applied on branch "${branch}". Nothing to do.`,
    )
    return false
  }

  const branchHasChanges = await performCherryPickFlow({
    hashesToPick,
    globals,
  })

  if (shouldPush && branchHasChanges) {
    await git.gitPush(remote, branch, cwd)
  }

  return branchHasChanges
}

/**
 * 准备分支环境，包括 fetch, pull, checkout
 */
export async function prepareBranch(
  branch: string,
  remote: string,
  cwd: string,
) {
  if (await git.isBranchTracked(branch, cwd)) {
    await git.gitFetch(remote, branch, cwd)
    await git.gitPull(remote, branch, cwd)
  }
  await git.gitCheckout(branch, cwd)
}

/**
 * 从 step 配置中获取并格式化目标分支列表
 */
export function getTargetBranches(step: CherryPickStep): string[] {
  return Array.isArray(step.with.targetBranches)
    ? step.with.targetBranches
    : [step.with.targetBranches]
}

/**
 * 从 step 配置中获取并格式化 commit hashes 列表
 */
export function getCommitHashes(step: CherryPickStep): string[] {
  return Array.isArray(step.with.commitHashes)
    ? step.with.commitHashes
    : [step.with.commitHashes]
}

/**
 * 分支选择的交互提示
 */
export async function promptForBranches(branches: string[]): Promise<string[]> {
  const options = branches.map(branch => ({ value: branch, label: branch }))
  return promptForMultiSelect(
    'Which branches to process? (Press <space> to toggle, <a> to toggle all, <enter> to submit)',
    options,
  )
}

/**
 * 仓库安全检查的流程
 */
export async function ensureRepoSafe(cwd: string) {
  logger.info('Performing pre-flight safety checks...')
  if (!(await isRepositoryInSafeState(cwd))) {
    throw new Error(
      'Pre-flight safety check failed. Please clean up your repository state.',
    )
  }
  logger.success('Safety checks passed. Proceeding...')
}
