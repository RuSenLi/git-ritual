import type { CherryPickStep } from '@/steps/cherry-pick/types'
import type { CreateWithPickStep } from '@/steps/creat-with-pick/types'
import type { PushStep } from '@/steps/push/types'

export type { CherryPickStep, CreateWithPickStep, PushStep }

export type uses = CherryPickStep | PushStep | CreateWithPickStep
