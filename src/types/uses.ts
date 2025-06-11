import type { CherryPickStep } from '@/steps/cherry-pick/types'
import type { PushStep } from '@/steps/push/types'

export type { CherryPickStep, PushStep }

export type uses = CherryPickStep | PushStep
