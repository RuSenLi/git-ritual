import type { Config, CustomTaskStep } from './types/options'
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
  }

  logger.log('')
  logger.success('🎉 All steps completed!')
}
