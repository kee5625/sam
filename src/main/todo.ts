import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type { TodoItem } from '../shared/types'

/**
 * Flat list of todo items, each optionally tagged with a subject.
 * "Study mode" is just the subject-grouped view of this same list.
 */
export class TodoStore {
  constructor(private file: string) {}

  private read(): TodoItem[] {
    if (!existsSync(this.file)) return []
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  private write(items: TodoItem[]): void {
    writeFileSync(this.file, JSON.stringify(items, null, 2))
  }

  list(): TodoItem[] {
    return this.read()
  }

  /** Items for one subject, case-insensitive. */
  bySubject(subject: string): TodoItem[] {
    const s = subject.toLowerCase().trim()
    return this.read().filter((i) => (i.subject ?? '').toLowerCase() === s)
  }

  /** All distinct subjects, in first-seen order. */
  subjects(): string[] {
    const seen = new Map<string, string>()
    for (const i of this.read()) {
      const s = i.subject?.trim()
      if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s)
    }
    return [...seen.values()]
  }

  add(text: string, subject?: string): TodoItem {
    const item: TodoItem = {
      id: randomUUID(),
      text: text.trim(),
      done: false,
      created: new Date().toISOString(),
      ...(subject?.trim() ? { subject: subject.trim() } : {})
    }
    this.write([...this.read(), item])
    return item
  }

  update(id: string, patch: Partial<Pick<TodoItem, 'text' | 'done' | 'subject'>>): void {
    this.write(this.read().map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  remove(id: string): void {
    this.write(this.read().filter((i) => i.id !== id))
  }

  /** Drops completed items — optionally only within one subject. */
  clearDone(subject?: string): void {
    const s = subject?.toLowerCase().trim()
    this.write(
      this.read().filter((i) => {
        if (!i.done) return true
        return s ? (i.subject ?? '').toLowerCase() !== s : false
      })
    )
  }
}
