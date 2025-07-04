import type { Config } from '../types'
import process from 'node:process'
import { loadConfig } from 'c12'
import { runSteps } from '../runner'
import { logger } from '../utils/logger'

export async function main(): Promise<void> {
  // 处理未捕获的异常和 Promise rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
    process.exit(1)
  })

  try {
    // 使用 c12 加载配置文件
    const loaded = await loadConfig<Config>({
      name: 'gitritual', // 配置文件名，会寻找 gitritual.config.ts 等
      rcFile: false, // 禁用 .gitritualrc
    })

    const config
      = typeof loaded.config === 'function'
        ? await (loaded.config as () => Promise<Config>)()
        : loaded.config

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
