import type { SpinnerOptions } from '@clack/prompts'
import { spinner as cSpinner } from '@clack/prompts'
import { logToFileOnly } from './logger'

/**
 * 基于 @clack/prompts 封装，添加日志监控功能
 */
export default function spinner(options?: SpinnerOptions) {
  const s = cSpinner(options)

  const spinnerWithLog = {
    start: (msg?: string) => {
      s.start(msg)
      msg && logToFileOnly(`[spinner start]: ${msg}`)
    },
    stop: (msg?: string, code?: number) => {
      s.stop(msg, code)
      const level = code === 0 ? 'error' : 'info'
      msg && logToFileOnly(`[spinner stop]: ${msg}`, level)
    },
    message: (msg?: string) => {
      s.message(msg)
      msg && logToFileOnly(`[spinner message]: ${msg}`)
    },
  }

  return spinnerWithLog
}
