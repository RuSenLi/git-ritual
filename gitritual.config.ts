import { defineConfig } from './src'

module.exports = defineConfig(() => {
  // 全局配置
  const globals = {
    cwd: 'C:/Users/RuSenLi/Desktop/git-play',
    push: false,
  }

  const steps = [
    {
      name: 'test run',
      run: `git log --grep "feat:"`,
    },
  ]

  return {
    globals,
    steps,
  }
})
