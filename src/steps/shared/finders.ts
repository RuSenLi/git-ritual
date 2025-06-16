import type { DefaultLogFields } from 'simple-git'
import type { CommitMessageCheck } from '@/steps/has-commit/types'
import type { TargetBranches } from '@/types'
import { spinner } from '@clack/prompts'
import { runCommandWithOutput } from '@/utils/exec'
import { getGit } from '@/utils/git'
import * as git from '@/utils/git'
import { logger } from '@/utils/logger'

// 查找器 (Finders) 包含了所有用于查找、筛选、查询 Git commit 的共享函数。

/**
 * 筛选出一个 commit 列表中，尚未被应用到目标分支的 commit。
 */
export async function filterCommitsToApply(
  commitHashes: string[],
  branch: string,
  cwd: string,
): Promise<string[]> {
  logger.info(`Checking which changes need to be applied on "${branch}"...`)

  // 1. 找出所有已应用的 hashes
  const appliedHashes = await findAppliedHashesByPatchId(
    commitHashes,
    branch,
    cwd,
  )
  const appliedHashesSet = new Set(appliedHashes)

  // 2. 基于上面的结果，从原始列表中筛选出需要处理的 hashes
  const hashesToPick: string[] = []
  for (const hash of commitHashes) {
    if (appliedHashesSet.has(hash)) {
      logger.log(
        `- Change from commit ${hash.substring(
          0,
          7,
        )} already applied. Skipping.`,
      )
    }
    else {
      hashesToPick.push(hash)
      logger.log(
        `- Change from commit ${hash.substring(0, 7)} needs to be applied.`,
      )
    }
  }

  return hashesToPick
}

async function getPatchId(
  commitHash: string,
  cwd: string,
): Promise<string | null> {
  try {
    const command = `git show ${commitHash} | git patch-id`
    const output = await runCommandWithOutput(command, { cwd })
    return output.split(' ')[0]
  }
  catch {
    return null
  }
}

async function getRecentPatchIds(
  branch: string,
  cwd: string,
  count = 500,
): Promise<Set<string>> {
  const s = spinner()
  s.start(`Analyzing recent commits on branch "${branch}"...`)
  const patchIds = new Set<string>()
  const git = getGit(cwd)
  try {
    const log = await git.log([branch, `--max-count=${count}`])
    for (const commit of log.all) {
      const patchId = await getPatchId(commit.hash, cwd)
      if (patchId) {
        patchIds.add(patchId)
      }
    }
    s.stop(`Analysis complete.`)
  }
  catch {
    s.stop('Failed to analyze commits.', 1)
  }
  return patchIds
}

/**
 * 根据 patch-id 查找已应用的 commit hashes
 * @param sourceHashes - 原始 commit hashes 列表
 * @param targetBranch - 目标分支
 * @param cwd - 工作目录
 * @returns Promise<string[]> - 返回在目标分支上找到匹配的 sourceHashes 列表
 */
export async function findAppliedHashesByPatchId(
  sourceHashes: string[],
  targetBranch: string,
  cwd: string,
): Promise<string[]> {
  const foundHashes: string[] = []
  const targetPatchIds = await getRecentPatchIds(targetBranch, cwd)

  for (const hash of sourceHashes) {
    const sourcePatchId = await getPatchId(hash, cwd)
    if (sourcePatchId && targetPatchIds.has(sourcePatchId)) {
      foundHashes.push(hash)
    }
  }
  return foundHashes
}

/**
 * 根据 message, author, date 等复杂条件查找 commits
 * @param checks - 检查规则对象列表
 * @param targetBranch - 目标分支
 * @param cwd - 工作目录
 * @returns Promise<DefaultLogFields[]> - 返回所有匹配到的 commit 对象
 */
export async function findCommitsByCriteria(
  checks: CommitMessageCheck[],
  targetBranch: string,
  cwd: string,
): Promise<DefaultLogFields[]> {
  const git = getGit(cwd)
  const allFoundCommits: DefaultLogFields[] = []

  for (const check of checks) {
    const logArgs: string[] = [targetBranch]

    if (check.message) {
      const messages = Array.isArray(check.message)
        ? check.message
        : [check.message]
      for (const msg of messages) {
        logArgs.push(`--grep=${msg}`)
      }
      logArgs.push('-E') // 启用扩展正则
    }

    if (check.author) {
      const authors = Array.isArray(check.author)
        ? check.author
        : [check.author]
      for (const author of authors) {
        logArgs.push(`--author=${author}`)
      }
    }

    if (check.date) {
      if (typeof check.date === 'string') {
        logArgs.push(`--since=${check.date} 00:00:00`)
        logArgs.push(`--until=${check.date} 23:59:59`)
      }
      else if (Array.isArray(check.date) && check.date.length === 2) {
        logArgs.push(`--since=${check.date[0]}`)
        logArgs.push(`--until=${check.date[1]}`)
      }
    }

    const log = await git.log(logArgs)
    allFoundCommits.push(...log.all)
  }

  if (allFoundCommits.length === 0)
    return []
  return [
    ...new Map(allFoundCommits.map(item => [item.hash, item])).values(),
  ]
}

/**
 * 解析出最终的目标分支列表
 */
export async function resolveTargetBranches(options: {
  targetBranches: TargetBranches
  cwd: string
}): Promise<string[]> {
  const { targetBranches, cwd } = options

  if (typeof targetBranches === 'string') {
    return [targetBranches]
  }
  if (Array.isArray(targetBranches)) {
    return targetBranches
  }

  if (typeof targetBranches === 'object') {
    const { branches, isRegex } = targetBranches
    const patterns = Array.isArray(branches) ? branches : [branches]

    // 如果不是正则模式，直接返回对象中的分支列表
    if (!isRegex) {
      return patterns
    }

    // 正则模式下，获取所有分支并进行匹配
    const allBranches = await git.getAllBranchNames(cwd)
    const matchedBranches = new Set<string>()

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern)
        for (const branch of allBranches) {
          if (regex.test(branch)) {
            matchedBranches.add(branch)
          }
        }
      }
      catch (e: any) {
        throw new Error(
          `Invalid regular expression provided: "${pattern}".\n${e.message}`,
        )
      }
    }
    return Array.from(matchedBranches)
  }

  return []
}
