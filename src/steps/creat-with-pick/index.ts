import type { CreateWithPickStep, CreationTask } from './types'
import type { GitRitualGlobals } from '@/types'
import ansis from 'ansis'
import { performCherryPickFlow, reportAndFinalizeStep } from '@/steps/shared'
import { filterCommitsToApply, toArray } from '@/steps/shared/finders'
import {
  isRepositoryInSafeState,
  prepareBranch,
} from '@/steps/shared/lifecycle'
import * as git from '@/utils/git'
import { logger, logMessage } from '@/utils/logger'
import { promptForMultiSelect } from '@/utils/prompts'
import { confirmOrAbort } from '@/utils/prompts'
import { resolveValue } from '../shared/resolveValue'

/**
 * `uses:create-with-pick` 步骤的处理器函数
 * @param step - CreateWithPickStep 类型的步骤配置
 * @param globals - 全局配置
 */
export async function handleCreateWithPick(
  step: CreateWithPickStep,
  globals: GitRitualGlobals,
) {
  const { cwd, patchIdCheckDepth } = globals
  const {
    tasks,
    skipTaskSelection,
    remote: withRemote,
    push: withPush,
  } = await resolveValue(step.with)
  const remote = withRemote ?? globals.remote ?? 'origin'
  const shouldPush = withPush ?? globals.push ?? false

  // 从列表中选择任务
  const taskOptions = tasks.map((task, i) => ({
    value: i.toString(),
    label: `Create "${task.newBranch}" from "${task.baseBranch}"`,
  }))

  let selectedTasks: CreationTask[]
  if (skipTaskSelection) {
    logger.info('Task selection prompt skipped as per configuration.')
    selectedTasks = tasks
  }
  else {
    const selectedIndexes = await promptForMultiSelect(
      'Which creation tasks to process? (Press <a> to toggle all)',
      taskOptions,
    )
    selectedTasks = selectedIndexes.map(index => tasks[Number(index)])
  }

  if (selectedTasks.length === 0) {
    logger.warn('No tasks selected. Exiting step.')
    return
  }
  logger.info(`Will process ${selectedTasks.length} creation task(s).`)

  // 安全检查并保存初始状态
  await isRepositoryInSafeState(cwd)
  const originalBranch = await git.getCurrentBranch(cwd)

  const successfulItems: string[] = []
  const failedItems: string[] = []
  const warnItems: string[] = []
  const spacesStr = ' '.repeat(4)

  for (const [i, task] of selectedTasks.entries()) {
    const taskIdentifier = `Task (${ansis.bold(
      `${task.baseBranch} -> ${task.newBranch}`,
    )})`
    logMessage(
      `\nProcessing ${taskIdentifier} (${i + 1}/${selectedTasks.length})`,
    )

    const { baseBranch, newBranch, commitHashes } = task

    try {
      await prepareBranch(baseBranch, remote, cwd)

      // 检查新分支是否存在，并与用户交互
      if (await git.isBranchNameInUse(newBranch, cwd)) {
        const useExisting = await confirmOrAbort(
          `Branch "${newBranch}" already exists. Use it and continue?`,
          true,
        )
        if (useExisting) {
          await prepareBranch(newBranch, remote, cwd)
        }
        else {
          const msg = `Skipping step as user chose not to proceed with existing branch "${newBranch}".`
          logger.warn(msg)
          warnItems.push(`${spacesStr}- ${taskIdentifier}: ${msg}`)
          continue
        }
      }
      else {
        await git.gitCreateBranchFrom(newBranch, baseBranch, cwd)
      }

      // 筛选并应用 commit
      const initialHashes = toArray(commitHashes)
      const hashesToPick = await filterCommitsToApply(
        initialHashes,
        newBranch,
        cwd,
        patchIdCheckDepth,
      )

      if (hashesToPick.length === 0) {
        successfulItems.push(
          `${spacesStr}- 🕊️ ${taskIdentifier} (no new changes)`,
        )
        continue
      }

      const [hasChanges, logMsg] = await performCherryPickFlow({
        hashesToPick,
        globals,
      })

      if (shouldPush && hasChanges) {
        await git.gitPush(remote, newBranch, cwd)
      }
      if (logMsg) {
        successfulItems.push(`${spacesStr}- ⚠️ ${taskIdentifier} (${logMsg})`)
      }
      else {
        successfulItems.push(
          `${spacesStr}- ${taskIdentifier} (changes applied)`,
        )
      }

      if (logMsg) {
        warnItems.push(`${spacesStr}- ${taskIdentifier}: ${logMsg}`)
      }
    }
    catch (error: any) {
      failedItems.push(`${spacesStr}- ${taskIdentifier}: ${error.message}`)
      // 尽力重置 Git 状态，以防影响下一个任务
      await git.gitReset(cwd).catch(() => {})
    }
  }

  // 4. 生成总结报告并安全地结束
  await reportAndFinalizeStep({
    stepName: 'Create-with-Pick',
    successfulItems,
    failedItems,
    warnItems,
    originalBranch,
    cwd,
  })
}
