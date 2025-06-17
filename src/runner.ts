import type { Config, CustomTaskStep, GitRitualStep } from '@/types'
import type {
  CherryPickStep,
  CreateWithPickStep,
  HasCommitStep,
  PushStep,
} from '@/types/uses'
import { gitFetchAll } from '@/utils/git'
import { promptForMultiSelect } from '@/utils/prompts'
import {
  handleCherryPick,
  handleCreateWithPick,
  handleHasCommit,
  handlePush,
} from './steps'
import { runCommand } from './utils/exec'
import { logger } from './utils/logger'

async function runCustomTask(step: CustomTaskStep, cwd: string) {
  if (!step.run)
    return

  const commands = Array.isArray(step.run) ? step.run : [step.run]
  for (const command of commands) {
    await runCommand(command, { cwd })
  }
}

export async function runSteps(config: Config) {
  const { steps, globals } = config

  let selectedSteps: GitRitualStep[]

  if (globals.skipStepSelection) {
    logger.info('Step selection prompt skipped as per configuration.')
    selectedSteps = steps
  }
  else {
    const stepOptions = steps.map((step: GitRitualStep, i) => ({
      value: i.toString(),
      label: step.name, // 使用步骤名称作为标签
    }))

    const selectedIndexes = await promptForMultiSelect(
      'Which steps to run? (Press <a> to toggle all)',
      stepOptions,
    )

    selectedSteps = selectedIndexes.map(index => steps[Number(index)])
  }

  if (selectedSteps.length === 0) {
    logger.warn('No steps selected. Exiting.')
    return
  }

  logger.info('Performing initial sync with remotes...')
  await gitFetchAll(globals.cwd)

  for (const step of selectedSteps) {
    logger.log('')
    if (step.name) {
      logger.success(`===== Running step: ${step.name} =====`)
    }

    if ('run' in step) {
      await runCustomTask(step as CustomTaskStep, globals.cwd)
    }
    else if ('uses' in step) {
      switch (step.uses) {
        case 'gitritual/cherry-pick@v1':
          await handleCherryPick(step as CherryPickStep, globals)
          break
        case 'gitritual/push@v1':
          await handlePush(step as PushStep, globals)
          break
        case 'gitritual/create-with-pick@v1':
          await handleCreateWithPick(step as CreateWithPickStep, globals)
          break
        case 'gitritual/has-commit@v1':
          await handleHasCommit(step as HasCommitStep, globals)
          break
        case 'gitritual/create-pr@v1':
          logger.warn(`'create-pr' step is not yet implemented.`)
          break
        default:
          logger.error(`Unknown step uses: ${(step as any).uses}`)
          break
      }
    }
  }

  logger.log('')
  logger.success('🎉 All steps completed!')
}
