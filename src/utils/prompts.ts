import type { Option } from '@clack/prompts'
import process from 'node:process'
import { confirm, isCancel, multiselect, select } from '@clack/prompts'
import { logger } from './logger'

/**
 * 向用户显示一个“是/否”的确认提示。
 * 如果用户按 Ctrl+C 取消，则会中止程序。
 * @param message - 要显示给用户的提示信息
 * @param initialValue - 默认值 (true 为 Yes, false 为 No)
 * @returns Promise<boolean> - 用户是否确认
 */
export async function confirmOrAbort(
  message: string,
  initialValue = false,
): Promise<boolean> {
  const shouldContinue = await confirm({
    message,
    initialValue,
  })

  if (isCancel(shouldContinue)) {
    logger.warn('Operation cancelled by user.')
    process.exit(0)
  }

  return shouldContinue
}

interface NextActionContext {
  isConflict: boolean
  // "Continue" 后要执行的下一个主要操作是什么
  nextActionName?: string
  // "Skip" 后要处理的下一个分支名
  nextBranchName?: string
}

// 定义一个我们自己的类型别名，让代码更清晰
type ActionValue = 'continue' | 'retry' | 'skip' | 'abort'

/**
 * 当指令执行失败时，向用户显示一个操作菜单
 * @param context - 包含当前错误和流程上下文的对象
 * @returns Promise<ActionValue>
 */
export async function promptForNextAction(
  context: NextActionContext,
): Promise<ActionValue> {
  const { isConflict, nextActionName, nextBranchName } = context

  const options: Option<ActionValue>[] = []

  // 只有在确认为冲突时，才显示“手动解决并继续”的选项
  if (isConflict) {
    options.push({
      value: 'continue',
      label: 'I have manually resolved the conflict, please continue',
      hint: nextActionName
        ? `Will run "git cherry-pick --continue" and then "${nextActionName}"`
        : 'Will continue processing.',
    })
  }

  options.push({
    value: 'retry',
    label: 'Retry the last command',
    hint: 'Useful for temporary errors like network issues.',
  })

  options.push({
    value: 'skip',
    label: 'Skip current branch',
    hint: nextBranchName
      ? `Will reset this branch and start processing "${nextBranchName}"`
      : 'This is the last branch; skipping will end the process.',
  })

  options.push({
    value: 'abort',
    label: 'Abort all operations',
    hint: 'The script will terminate immediately.',
  })

  const resolution = await select<'continue' | 'retry' | 'skip' | 'abort'>({
    message: 'An operation failed. What would you like to do?',
    options,
  })

  if (isCancel(resolution)) {
    logger.warn('Operation cancelled by user.')
    process.exit(0)
  }

  return resolution
}

/**
 * 显示一个多选菜单，让用户选择要处理的项
 * @param message 提示信息
 * @param options 所有可选的项
 * @returns Promise<string[]> 用户选中的项的数组
 */
export async function promptForMultiSelect(
  message: string,
  options: Option<string>[],
): Promise<string[]> {
  const selected = await multiselect<string>({
    message,
    options,
    required: false, // 允许用户不选择任何项
    initialValues: options.map(opt => opt.value), // 默认全选
  })

  if (isCancel(selected)) {
    logger.warn('Operation cancelled by user.')
    process.exit(0)
  }

  return selected as string[]
}
