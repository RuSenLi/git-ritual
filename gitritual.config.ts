import { defineConfig } from './src'

export default defineConfig({
  globals: {
    cwd: 'C:/Users/RuSenLi/Desktop/git-play',
    push: true,
  },
  steps: [
    {
      name: 'cherry-pick',
      uses: 'gitritual/cherry-pick@v1',
      with: {
        commitHashes: ['560ece7b0d018a0bc1baa54e7f33cca4833b13f1', 'aadb7bc9ae4196f719cf4f2501a933e3e95d1a45'],
        targetBranches: ['ritual-beta', 'ritual-dev'],
      },
    },
  ],
})
