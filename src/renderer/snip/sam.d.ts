export {}

declare global {
  interface Window {
    sam: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, fn: (...args: unknown[]) => void) => () => void
    }
  }
}
