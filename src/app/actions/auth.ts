'use server'

import { isDisposableEmail } from '@/lib/disposable-email'

export async function checkEmail(email: string): Promise<{ disposable: boolean }> {
  return { disposable: isDisposableEmail(email) }
}
