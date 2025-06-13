import type { SimpleGit, SimpleGitOptions } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'
import { spinner } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { runCommandWithOutput } from './exec'
import { logger } from './logger'

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

export async function gitFetch(remote: string, branch: string, cwd: string) {
  const s = spinner()
  s.start(`Fetching updates for ${branch} from ${remote}...`)
  try {
    await getGit(cwd).fetch(remote, branch)
    s.stop(`Successfully fetched updates for ${branch}.`)
  }
  catch (error) {
    s.stop(`Failed to fetch updates for ${branch}.`, 1)
    throw error
  }
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
  const s = spinner()
  s.start(`Pulling latest changes for "${branch}"...`)
  try {
    await getGit(cwd).pull(remote, branch, { '--ff-only': null })
    s.stop(`Branch "${branch}" is up to date.`)
  }
  catch (error) {
    s.stop(`Failed to pull changes for "${branch}".`, 1)
    throw error
  }
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
  const s = spinner()
  s.start(`Pushing changes to ${remote}/${branch}...`)
  try {
    await getGit(cwd).push(['--set-upstream', remote, branch])
    s.stop(`Successfully pushed to ${remote}/${branch}.`)
  }
  catch (error) {
    s.stop(`Failed to push to ${remote}/${branch}.`, 1)
    throw error
  }
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
 * 检查指定的本地分支是否存在
 * @param branchName 要检查的分支名
 * @param cwd 工作目录
 * @returns Promise<boolean>
 */
export async function doesLocalBranchExist(
  branchName: string,
  cwd: string,
): Promise<boolean> {
  const s = spinner()
  s.start(`Checking for existing branch "${branchName}"...`)
  try {
    const localBranches = await getGit(cwd).branchLocal()
    const exists = branchName in localBranches.branches

    s.stop(
      exists
        ? `Branch "${branchName}" found.`
        : `Branch "${branchName}" not found.`,
    )
    return exists
  }
  catch {
    s.stop(`Failed to check for branch "${branchName}".`, 1)
    return false
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
