import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { ChatMessage } from '../shared/types'

export class History {
  private msgs: ChatMessage[] = []

  constructor(private file: string, private cap = 50) {
    if (existsSync(file)) {
      try {
        this.msgs = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        this.msgs = []
      }
    }
  }

  add(role: 'user' | 'assistant', content: string): void {
    this.msgs.push({ role, content })
    if (this.msgs.length > this.cap) this.msgs = this.msgs.slice(-this.cap)
    writeFileSync(this.file, JSON.stringify(this.msgs))
  }

  recent(n: number): ChatMessage[] {
    return this.msgs.slice(-n)
  }
}
