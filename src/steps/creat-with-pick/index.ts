import type { CreateWithPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
import { performCherryPickFlow } from '@/utils/perform-cherry-pick-flow'
import { confirmOrAbort } from '@/utils/prompts'

/**
 * `uses:create-with-pick` 步骤的处理器函数
 * @param step - CreateWithPickStep 类型的步骤配置
 * @param globals - 全局配置
 */
export async function handleCreateWithPick(
  step: CreateWithPickStep,
  globals: GitRitualGlobals,
) {
  const { cwd } = globals
  const { baseBranch, newBranch, commitHashes } = step.with
  const remote = step.with.remote ?? globals.remote ?? 'origin'
  const shouldPush = step.with.push ?? globals.push ?? false

  logger.info(
    `Starting step "create-with-pick": from "${baseBranch}" to "${newBranch}"`,
  )

  // 安全检查并保存初始状态
  if (!(await git.isRepositoryInSafeState(cwd))) {
    throw new Error(
      'Pre-flight safety check failed. Please clean up your repository state.',
    )
  }
  const originalBranch = await git.getCurrentBranch(cwd)

  try {
    // 准备基底分支环境
    logger.info(`Preparing base branch "${baseBranch}"...`)
    if (await git.isBranchTracked(baseBranch, cwd)) {
      await git.gitFetch(remote, baseBranch, cwd)
      await git.gitPull(remote, baseBranch, cwd)
    }
    await git.gitCheckout(baseBranch, cwd)

    // 检查目标分支是否存在
    const branchExists = await git.doesLocalBranchExist(newBranch, cwd)
    if (branchExists) {
      logger.warn(`Branch "${newBranch}" already exists.`)
      const useExisting = await confirmOrAbort(
        `Do you want to use this existing branch and continue?`,
        true,
      )

      if (useExisting) {
        await git.gitCheckout(newBranch, cwd)
      }
      else {
        logger.warn(
          `Skipping step because user chose not to proceed with existing branch "${newBranch}".`,
        )
        await git.gitCheckout(originalBranch, cwd)
        return
      }
    }
    else {
      await git.gitCreateBranchFrom(newBranch, baseBranch, cwd)
    }

    // 后续的 cherry-pick 流程
    const hashesToPick = Array.isArray(commitHashes)
      ? commitHashes
      : [commitHashes]
    const hasChanges = await performCherryPickFlow({
      hashesToPick,
      globals,
    })

    if (shouldPush && hasChanges) {
      await git.gitPush(remote, newBranch, cwd)
    }
  }
  catch (error) {
    logger.error(`An unrecoverable error occurred during create-with-pick.`)
    await git.gitCheckout(originalBranch, cwd).catch(() => {})
    throw error
  }

  await git.gitCheckout(originalBranch, cwd)
  logger.success('🎉 Create-with-pick step completed successfully!')
}
