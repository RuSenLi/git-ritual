import type { Config, CustomTaskStep } from '@/types'
import type { CherryPickStep, PushStep } from '@/types/uses'
import { handleCherryPick, handlePush } from './steps'
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

  for (const step of steps) {
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
        case 'gitritual/create-with-cherry@v1':
          logger.warn(`'create-with-cherry' step is not yet implemented.`)
          break
        case 'gitritual/has-commit@v1':
          logger.warn(`'has-commit' step is not yet implemented.`)
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
