import type { Config } from './types/options'

type props = Config | (() => Config)

export function defineConfig(config: props): Config {
  if (typeof config === 'function') {
    config = config()
  }

  return config
}
