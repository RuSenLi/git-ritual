import { defineConfig } from './src'

export default defineConfig({
  globals: {
    cwd: 'C:/Users/RuSenLi/Desktop/git-play',
    push: true,
  },
  steps: [
    // {
    //   name: 'cherry-pick',
    //   uses: 'gitritual/cherry-pick@v1',
    //   with: {
    //     commitHashes: ['560ece7b0d018a0bc1baa54e7f33cca4833b13f1', 'aadb7bc9ae4196f719cf4f2501a933e3e95d1a45'],
    //     targetBranches: ['ritual-beta', 'ritual-dev'],
    //   },
    // },
    // {
    //   name: 'push',
    //   uses: 'gitritual/push@v1',
    //   with: {
    //     branches: ['ritual-dev', 'ritual-beta'],
    //   },
    // },
    {
      name: '基于保护分支创建修复分支，并挑选修复代码',
      uses: 'gitritual/create-with-pick@v1',
      with: {
        baseBranch: 'main',
        newBranch: 'f_ritual_lrs/10086',
        commitHashes: '485d9e41163b6edb8b0d71e0530de687a90cb88c',
      },
    },
  ],
})
