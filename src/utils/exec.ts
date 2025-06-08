import type { Options } from 'execa'
import { execa } from 'execa'
import { logger } from './logger'

/**
 * 在 shell 环境中执行一个完整的命令字符串
 * @param commandString - 要执行的完整命令字符串
 * @param options - execa 选项
 * @returns execa 的执行结果
 */
export async function runCommand(commandString: string, options: Options = {}) {
  logger.info(`> ${commandString}`)

  // execa 的第一个参数可以直接是命令字符串
  // 并设置 shell: true
  const result = await execa(commandString, {
    shell: true, // 启用 shell 模式
    stdio: 'inherit',
    ...options,
  })

  return result
}

/**
 * 执行命令并捕获其标准输出
 */
export async function runCommandWithOutput(
  commandString: string,
  options: Options = {},
): Promise<string> {
  const result = await execa(commandString, {
    shell: true,
    ...options,
  })
  return String(result.stdout ?? '')
}
