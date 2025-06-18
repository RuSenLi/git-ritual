import type { Config } from './types'

type DefineConfig = Config | Promise<Config> | (() => Config | Promise<Config>)

export function defineConfig<T extends DefineConfig>(config: T): T {
  return config
}
