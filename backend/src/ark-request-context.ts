import { AsyncLocalStorage } from 'node:async_hooks'

type ArkRequestContextStore = {
  arkApiKey: string
}

const arkRequestContext = new AsyncLocalStorage<ArkRequestContextStore>()

export function runWithArkApiKey<T>(arkApiKey: string, callback: () => T) {
  return arkRequestContext.run(
    {
      arkApiKey: String(arkApiKey || '').trim(),
    },
    callback,
  )
}

export function getArkApiKeyOverride() {
  return arkRequestContext.getStore()?.arkApiKey || ''
}

