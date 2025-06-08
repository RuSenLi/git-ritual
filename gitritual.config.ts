import { defineConfig } from './src'

module.exports = defineConfig(() => {
  // 全局配置
  const globals = {
    // git工作目录非config所在目录
    cwd: 'path/to/your/project',
    fetchAll: false,
    push: false,
  }

  const steps = [
    {
      name: 'feat: cherry-pick',
      run: `git log --grep "chore: init"`,
    },
  ]

  return {
    globals,
    steps,
  }
})
