import type { ResolvableValue } from '@/types'

function isCallable<T>(
  value: ResolvableValue<T>,
): value is () => T | Promise<T> {
  return typeof value === 'function'
}

export async function resolveValue<T>(
  resolvable: ResolvableValue<T>,
): Promise<T> {
  if (isCallable(resolvable)) {
    const result = await resolvable()
    return result
  }

  return resolvable
}
