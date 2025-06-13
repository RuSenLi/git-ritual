import type { CreateWithPickStep } from './types'
import type { GitRitualGlobals } from '@/types'
import { filterCommitsToApply, performCherryPickFlow } from '@/steps/shared'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'
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
  await git.isRepositoryInSafeState(cwd)
  const originalBranch = await git.getCurrentBranch(cwd)

  try {
    // 准备基底分支环境
    logger.info(`Preparing base branch "${baseBranch}"...`)
    if (await git.isBranchTracked(baseBranch, cwd)) {
      await git.gitFetch(remote, baseBranch, cwd)
      await git.gitPull(remote, baseBranch, cwd)
    }
    await git.gitCheckout(baseBranch, cwd)

    // 检查新分支是否存在，并与用户交互
    if (await git.isBranchNameInUse(newBranch, cwd)) {
      const useExisting = await confirmOrAbort(
        `Branch "${newBranch}" already exists. Use it and continue?`,
        true,
      )
      if (useExisting) {
        if (await git.isBranchTracked(newBranch, cwd)) {
          await git.gitFetch(remote, newBranch, cwd)
          await git.gitPull(remote, newBranch, cwd)
        }
        await git.gitCheckout(newBranch, cwd)
      }
      else {
        logger.warn(
          `Skipping step as user chose not to proceed with existing branch "${newBranch}".`,
        )
        await git.gitCheckout(originalBranch, cwd)
        return
      }
    }
    else {
      await git.gitCreateBranchFrom(newBranch, baseBranch, cwd)
    }

    // 筛选并应用 commit
    const initialHashes = Array.isArray(commitHashes)
      ? commitHashes
      : [commitHashes]
    const hashesToPick = await filterCommitsToApply(
      initialHashes,
      newBranch,
      cwd,
    )

    if (hashesToPick.length === 0) {
      logger.success(
        `All changes already exist on new branch "${newBranch}". Nothing to do.`,
      )
      await git.gitCheckout(originalBranch, cwd)
      return
    }

    const hasChanges = await performCherryPickFlow({
      hashesToPick,
      globals,
    })

    if (shouldPush && hasChanges) {
      await git.gitPush(remote, newBranch, cwd)
    }
    logger.success('🎉 Create-with-pick step completed successfully!')
  }
  catch (error) {
    logger.error(`An unrecoverable error occurred during create-with-pick.`)
    await git.gitCheckout(originalBranch, cwd).catch(() => {})
    throw error
  }

  try {
    logger.info(
      `\nStep finished. Switching back to original branch "${originalBranch}".`,
    )
    await git.gitCheckout(originalBranch, cwd)
  }
  catch (e: any) {
    logger.warn(
      `⚠️  Warning: All tasks completed, but failed to switch back to the original branch "${originalBranch}". Please switch manually.`,
    )
    logger.warn(`   Reason: ${e.message}`)
  }
}
