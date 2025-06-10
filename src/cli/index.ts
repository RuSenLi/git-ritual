import type { Config } from '../types'
import process from 'node:process'
import { loadConfig } from 'c12'
import { runSteps } from '../runner'
import { logger } from '../utils/logger'

export async function main(): Promise<void> {
  try {
    // 使用 c12 加载配置文件
    const { config } = await loadConfig<Config>({
      name: 'gitritual', // 配置文件名，会寻找 gitritual.config.ts 等
      rcFile: false, // 禁用 .gitritualrc
    })

    if (!config) {
      logger.error('Configuration file (gitritual.config.ts) not found.')
      process.exit(1)
    }

    // 校验全局配置
    if (!config.globals?.cwd) {
      logger.error(
        'Global config "cwd" (current working directory) is required.',
      )
      process.exit(1)
    }

    // 将解析后的配置传入执行器
    await runSteps(config)
  }
  catch (error: any) {
    logger.error(`An error occurred: ${error.message}`)
    process.exit(1)
  }
}
