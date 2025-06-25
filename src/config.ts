import type { Config } from './types'

export function defineConfig(
  config: Config | Promise<Config> | (() => Config | Promise<Config>),
): typeof config {
  return config
}
