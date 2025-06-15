import type { SimpleGit, SimpleGitOptions } from 'simple-git'
import type { DefaultLogFields } from 'simple-git'
import type { CommitMessageCheck } from '@/steps/has-commit/types'
import fs from 'node:fs'
import path from 'node:path'
import { spinner } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { runCommandWithOutput } from './exec'
import { logger } from './logger'
import { confirmOrAbort } from './prompts'

function getGit(cwd: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: cwd,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
  }
  return simpleGit(options)
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
  count = 200,
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

export async function isChangeApplied(
  sourceCommitHash: string,
  targetBranch: string,
  cwd: string,
): Promise<boolean> {
  const sourcePatchId = await getPatchId(sourceCommitHash, cwd)
  if (!sourcePatchId) {
    logger.warn(
      `Could not generate patch-id for source commit ${sourceCommitHash}. Skipping check.`,
    )
    return false
  }

  const targetPatchIds = await getRecentPatchIds(targetBranch, cwd)
  return targetPatchIds.has(sourcePatchId)
}

export async function isRepositoryInSafeState(cwd: string): Promise<boolean> {
  const status = await getGit(cwd).status()
  if (!status.isClean()) {
    logger.error(
      'Workspace is not clean. Please commit or stash your changes.',
    )
    return false
  }

  const gitDir = path.join(cwd, '.git')
  const stateFiles = [
    'CHERRY_PICK_HEAD',
    'MERGE_HEAD',
    'REBASE_HEAD',
    'REVERT_HEAD',
  ]
  for (const file of stateFiles) {
    if (fs.existsSync(path.join(gitDir, file))) {
      logger.error(
        `Repository is in the middle of a "${file.split('_')[0]}" operation.`,
      )
      logger.warn(
        'Please resolve or abort the existing operation before running the script.',
      )
      return false
    }
  }
  return true
}

/**
 * 一个高阶函数，为异步操作提供交互式重试能力
 * @param action - 需要执行的异步函数
 * @param messages - 用于 spinner 的提示信息
 * @param messages.start 操作开始时的提示信息
 * @param messages.success 操作成功时的提示信息
 * @param messages.failure 操作失败时的提示信息
 */
async function withRetry(
  action: () => Promise<any>,
  messages: { start: string, success: string, failure: string },
) {
  while (true) {
    const s = spinner()
    s.start(messages.start)
    try {
      await action()
      s.stop(messages.success)
      return
    }
    catch (error: any) {
      s.stop(messages.failure, 1)
      logger.error(`  Reason: ${error.message}`)

      const shouldRetry = await confirmOrAbort(
        'This operation failed, possibly due to a network issue. Do you want to retry?',
        true,
      )

      if (!shouldRetry) {
        throw error
      }
    }
  }
}

/**
 * 获取所有远程仓库的最新信息，并清理已不存在的远程分支引用
 */
export async function gitFetchAll(cwd: string) {
  await withRetry(() => getGit(cwd).fetch(['--all', '--prune']), {
    start: 'Fetching all remotes to sync state...',
    success: 'Successfully synced with all remotes.',
    failure: 'Failed to fetch from remotes.',
  })
}

export async function gitFetch(remote: string, branch: string, cwd: string) {
  await withRetry(() => getGit(cwd).fetch(remote, branch), {
    start: `Fetching updates for ${branch} from ${remote}...`,
    success: `Successfully fetched updates for ${branch}.`,
    failure: `Failed to fetch updates for ${branch}.`,
  })
}

export async function gitCheckout(branch: string, cwd: string) {
  const s = spinner()
  s.start(`Switching to branch "${branch}"...`)
  try {
    await getGit(cwd).checkout(branch)
    s.stop(`Switched to branch "${branch}".`)
  }
  catch (error) {
    s.stop(`Failed to switch to branch "${branch}".`, 1)
    throw error
  }
}

export async function gitPull(remote: string, branch: string, cwd: string) {
  await withRetry(
    () => getGit(cwd).pull(remote, branch, { '--ff-only': null }),
    {
      start: `Pulling latest changes for "${branch}"...`,
      success: `Branch "${branch}" is up to date.`,
      failure: `Failed to pull changes for "${branch}".`,
    },
  )
}

export async function gitCherryPick(hashes: string[], cwd: string) {
  const s = spinner()
  const hashAbbrevs = hashes.map(h => h.substring(0, 7)).join(', ')
  s.start(`Applying commits: ${hashAbbrevs}...`)
  try {
    await getGit(cwd).raw(['cherry-pick', ...hashes])
    s.stop(`Successfully applied commits: ${hashAbbrevs}.`)
  }
  catch (error) {
    s.stop(`Failed to apply commits: ${hashAbbrevs}.`, 1)
    throw error
  }
}

export async function gitPush(remote: string, branch: string, cwd: string) {
  await withRetry(() => getGit(cwd).push(['--set-upstream', remote, branch]), {
    start: `Pushing changes to ${remote}/${branch}...`,
    success: `Successfully pushed to ${remote}/${branch}.`,
    failure: `Failed to push to ${remote}/${branch}.`,
  })
}

export async function isBranchTracked(
  branchName: string,
  cwd: string,
): Promise<boolean> {
  try {
    await getGit(cwd).revparse(['--abbrev-ref', `${branchName}@{u}`])
    return true
  }
  catch {
    return false
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  return await getGit(cwd).revparse(['--abbrev-ref', 'HEAD'])
}

export async function gitReset(cwd: string): Promise<void> {
  await getGit(cwd).reset(['--hard'])
}

export async function gitCherryPickContinue(cwd: string): Promise<void> {
  await getGit(cwd).raw(['cherry-pick', '--continue'])
}

export async function gitCherryPickSkip(cwd: string): Promise<void> {
  await getGit(cwd).raw(['cherry-pick', '--skip'])
}

export async function gitCherryPickAbort(cwd: string): Promise<void> {
  await getGit(cwd).raw(['cherry-pick', '--abort'])
}

/**
 * 获取本地分支相对于其上游远程分支的状态
 * @param cwd
 * @returns Promise<{ ahead: number; behind: number; tracking: string | null; }>
 */
export async function getBranchUpstreamStatus(cwd: string) {
  const status = await getGit(cwd).status()
  return {
    ahead: status.ahead,
    behind: status.behind,
    tracking: status.tracking,
  }
}

/**
 * 从一个基底分支创建并切换到一个新分支
 * @param newBranch - 新分支的名称
 * @param baseBranch - 基底分支的名称
 * @param cwd - 工作目录
 */
export async function gitCreateBranchFrom(
  newBranch: string,
  baseBranch: string,
  cwd: string,
) {
  const s = spinner()
  s.start(`Creating new branch "${newBranch}" from "${baseBranch}"...`)
  try {
    await getGit(cwd).checkout(['-b', newBranch, baseBranch])
    s.stop(`Successfully created and switched to branch "${newBranch}".`)
  }
  catch (error) {
    s.stop(`Failed to create branch "${newBranch}".`, 1)
    throw error
  }
}

/**
 * 检查一个分支名称是否已经被本地或远程占用
 * @param branchName 要检查的分支名
 * @param cwd 工作目录
 * @returns Promise<boolean>
 */
export async function isBranchNameInUse(
  branchName: string,
  cwd: string,
): Promise<boolean> {
  const s = spinner()
  s.start(
    `Checking if branch name "${branchName}" is already in use (local & remote)...`,
  )
  const git = getGit(cwd)

  try {
    const branchSummary = await git.branch(['-a'])

    if (branchSummary.branches[branchName]) {
      s.stop(`Branch name "${branchName}" is already in use locally.`)
      return true
    }

    const remoteBranchExists = branchSummary.all.some((remoteRef) => {
      if (!remoteRef.startsWith('remotes/')) {
        return false
      }

      const parts = remoteRef.split('/')

      if (parts.length < 3) {
        return false
      }

      const remoteBranchName = parts.slice(2).join('/')

      return remoteBranchName === branchName
    })

    if (remoteBranchExists) {
      s.stop(`Branch name "${branchName}" is already in use on a remote.`)
      return true
    }

    s.stop(`Branch name "${branchName}" is available.`)
    return false
  }
  catch {
    s.stop(`Failed to check for branch "${branchName}".`, 1)
    return true
  }
}
/**
 * 获取当前 HEAD 的 commit hash
 * @param cwd 工作目录
 * @returns Promise<string>
 */
export async function getHeadHash(cwd: string): Promise<string> {
  return await getGit(cwd).revparse('HEAD')
}

/**
 * 检查当前仓库是否正处于 cherry-pick 的中间状态
 * @param cwd 工作目录
 * @returns boolean
 */
export function isCherryPickInProgress(cwd: string): boolean {
  const gitDir = path.join(cwd, '.git')
  return fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))
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
