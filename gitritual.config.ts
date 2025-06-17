import type { CommitHashes, GitRitualStep } from './src/types'
import type {
  CherryPickStep,
  CreateWithPickStep,
  HasCommitStep,
  PushStep,
} from './src/types/uses'
import { defineConfig } from './src'

interface ProjectOptions {
  remote?: string
  branches: string[]
  commitHashes?: CommitHashes
}

export default defineConfig(() => {
  const cwd = {
    pc: 'D:/rusenli/project/dfs-front-hotfix',
    mobile: 'D:/rusenli/project/dfs-web',
  }

  const globals = {
    cwd: cwd.mobile,
    push: true,
  }

  const commitHashes: CommitHashes = [
    'af21a692b8be6b178b558b86c162560d5addb954',
  ]

  const newBranchName = {
    version: '3.3',
    author: 'lrs',
    info: '1016323_hotfix',
  }

  const getNewBranchName = (b: string) => {
    const { version, author, info } = newBranchName
    return `f_${version}_${b}_${author}/${info}`
  }

  const dfs = {
    commitHashes,
    // remote: 'https://e.coding.net/yhmsi/dfs/dfs-front.git',
    branches: [
      'sccj',
      'myzy',
      'zzyy',
      'ynwlt',
      'jxcj',
      'gzqg',
      'cdnk',
      'szzx',
      'jjzd',
    ],
  }

  const ics = {
    commitHashes,
    remote: 'https://e.coding.net/yhmsi/ics/ics-front.git',
    branches: ['jsnm', 'xzgy'],
  }

  const DEVELOP = 'develop'
  const BETA = 'beta'
  const HOTFIX = 'hotfix'
  const RELEASE = 'release'

  const charryPickSteps = ({
    remote,
    branches,
    commitHashes: hash,
  }: ProjectOptions): CherryPickStep[] => {
    const targetBranches = branches.flatMap(b => [
      `${b}-${DEVELOP}`,
      `${b}-${BETA}`,
      `^${b}-.*-${HOTFIX}$`,
    ])
    return [
      {
        name: `cherry-pick`,
        uses: 'gitritual/cherry-pick@v1',
        with: {
          remote,
          targetBranches: {
            branches: targetBranches,
            isRegex: true,
          },
          commitHashes: hash ?? commitHashes,
        },
      },
    ]
  }

  const creteWithPickSteps = ({
    remote,
    branches,
    commitHashes: hash,
  }: ProjectOptions): CreateWithPickStep[] => {
    const tasks = branches.map((b) => {
      return {
        baseBranch: `${b}-${RELEASE}`,
        newBranch: getNewBranchName(b),
        commitHashes: hash ?? commitHashes,
      }
    })

    return [{
      name: `create-with-pick`,
      uses: 'gitritual/create-with-pick@v1',
      with: {
        tasks,
        remote,
      },
    }]
  }

  const hasCommitSteps = ({
    branches,
    commitHashes: hash,
  }: ProjectOptions): HasCommitStep[] => {
    const targetBranches = branches.flatMap(b => [`^${b}-`])

    return [
      {
        name: `has-commit`,
        uses: 'gitritual/has-commit@v1',
        with: {
          targetBranches: {
            branches: targetBranches,
            isRegex: true,
          },
          commitHashes: hash ?? commitHashes,
        },
      },
    ]
  }

  const pushSteps = ({ branches }: ProjectOptions): PushStep[] => {
    const targetBranches = branches.flatMap(b => [
      `${b}-${DEVELOP}`,
      `${b}-${BETA}`,
      `^${b}-.*-${HOTFIX}$`,
      getNewBranchName(b),
    ])

    return [
      {
        name: 'push',
        uses: 'gitritual/push@v1',
        with: {
          targetBranches: {
            branches: targetBranches,
            isRegex: true,
          },
        },
      },
    ]
  }

  const generateSteps = (options: ProjectOptions): GitRitualStep[] => {
    return [
      ...charryPickSteps(options),
      ...creteWithPickSteps(options),
      ...hasCommitSteps(options),
      ...pushSteps(options),
    ]
  }

  return {
    globals,
    steps: generateSteps(dfs),
  }
})
