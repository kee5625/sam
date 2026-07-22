import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { TodoStore } from '../src/main/todo'

let file: string
beforeEach(() => { file = join(mkdtempSync(join(tmpdir(), 'sam-todo-')), 'todos.json') })

describe('TodoStore', () => {
  it('adds, lists and persists across instances', () => {
    const store = new TodoStore(file)
    store.add('listen to lecture 8', 'ds')
    expect(store.list()).toHaveLength(1)
    const reloaded = new TodoStore(file).list()
    expect(reloaded[0].text).toBe('listen to lecture 8')
    expect(reloaded[0].subject).toBe('ds')
    expect(reloaded[0].done).toBe(false)
  })

  it('omits subject when none given', () => {
    const store = new TodoStore(file)
    expect(store.add('buy milk').subject).toBeUndefined()
  })

  it('filters by subject case-insensitively', () => {
    const store = new TodoStore(file)
    store.add('practice hw1', 'DS')
    store.add('read ch 4', 'os')
    expect(store.bySubject('ds').map((i) => i.text)).toEqual(['practice hw1'])
  })

  it('lists distinct subjects in first-seen order', () => {
    const store = new TodoStore(file)
    store.add('a', 'ds')
    store.add('b', 'os')
    store.add('c', 'DS')
    store.add('d')
    expect(store.subjects()).toEqual(['ds', 'os'])
  })

  it('updates and removes by id', () => {
    const store = new TodoStore(file)
    const item = store.add('practice hw1', 'ds')
    store.update(item.id, { done: true, text: 'practice hw1 + hw2' })
    expect(store.list()[0]).toMatchObject({ done: true, text: 'practice hw1 + hw2' })
    store.remove(item.id)
    expect(store.list()).toEqual([])
  })

  it('clears done items, optionally scoped to a subject', () => {
    const store = new TodoStore(file)
    const a = store.add('a', 'ds')
    const b = store.add('b', 'os')
    store.add('c', 'ds')
    store.update(a.id, { done: true })
    store.update(b.id, { done: true })

    store.clearDone('ds')
    expect(store.list().map((i) => i.text).sort()).toEqual(['b', 'c'])

    store.clearDone()
    expect(store.list().map((i) => i.text)).toEqual(['c'])
  })

  it('survives a corrupt file', () => {
    const store = new TodoStore(file)
    store.add('x')
    writeFileSync(file, 'not json')
    expect(new TodoStore(file).list()).toEqual([])
  })
})
