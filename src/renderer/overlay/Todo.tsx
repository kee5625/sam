import { useRef, useState } from 'react'
import type { TodoItem } from '../../shared/types'

interface Props {
  items: TodoItem[]
  /** When set, only this subject is shown and new items inherit it. */
  filter?: string
  onAdd: (text: string, subject?: string) => void
  onToggle: (id: string) => void
  onEdit: (id: string, text: string) => void
  onRemove: (id: string) => void
}

function CheckListIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
function CheckIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
function PlusIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function XIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
function ChevronIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** "ds: practice hw1" -> { subject: 'ds', text: 'practice hw1' } */
function parseDraft(raw: string): { text: string; subject?: string } {
  const m = raw.match(/^([\w+#. -]{1,24}):\s*(.+)$/)
  if (m) return { subject: m[1].trim(), text: m[2].trim() }
  return { text: raw.trim() }
}

export default function Todo({ items, filter, onAdd, onToggle, onEdit, onRemove }: Props): JSX.Element {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const addRef = useRef<HTMLInputElement>(null)

  const toggleGroup = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const shown = filter
    ? items.filter((i) => (i.subject ?? '').toLowerCase() === filter.toLowerCase())
    : items
  const doneCount = shown.filter((i) => i.done).length

  // group: subjects first (in first-seen order), then untagged
  const groups: { subject: string | null; items: TodoItem[] }[] = []
  for (const item of shown) {
    const key = item.subject?.trim() || null
    const hit = groups.find((g) => (g.subject ?? '').toLowerCase() === (key ?? '').toLowerCase())
    if (hit) hit.items.push(item)
    else groups.push({ subject: key, items: [item] })
  }
  groups.sort((a, b) => (a.subject === null ? 1 : 0) - (b.subject === null ? 1 : 0))

  const add = (): void => {
    if (!draft.trim()) return
    const parsed = parseDraft(draft)
    onAdd(parsed.text, filter ?? parsed.subject)
    setDraft('')
    setTimeout(() => addRef.current?.focus(), 0)
  }

  const commitEdit = (): void => {
    if (editingId) {
      const t = editText.trim()
      if (t) onEdit(editingId, t)
      else onRemove(editingId)
    }
    setEditingId(null)
  }

  const addRow = (
    <div className="addRow">
      <PlusIcon />
      <input
        ref={addRef}
        value={draft}
        placeholder={filter ? `Add to ${filter}…` : 'Add an item… (try "ds: listen to lecture 8")'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add() }}
      />
    </div>
  )

  return (
    <div className="card">
      <div className="cardHead">
        <span className="orb" />
        <span className="q">{filter ? `study · ${filter}` : 'todo'}</span>
        {shown.length > 0
          ? <span className="todoCount">{doneCount} of {shown.length} done</span>
          : <span className="todoBadge">{filter ? 'Study' : 'Todo'}</span>}
      </div>

      {shown.length === 0 ? (
        <div className="todoEmpty">
          <div className="todoEmptyIcon"><CheckListIcon /></div>
          <div className="todoEmptyTitle">{filter ? `Nothing for ${filter} yet` : 'No items yet'}</div>
          <div className="todoEmptyHint">
            Start typing below to add your first item — press <span className="kbd">Enter</span> to save each one.
          </div>
          <div style={{ width: 340 }}>{addRow}</div>
        </div>
      ) : (
        <div className="todoList">
          {groups.map((g) => {
            const key = g.subject ?? '__none'
            // headers only exist in the grouped view; a filtered view is one group
            const grouped = !filter && (g.subject !== null || groups.length > 1)
            const isCollapsed = grouped && collapsed.has(key)
            const gDone = g.items.filter((i) => i.done).length
            return (
            <div key={key}>
              {grouped && (
                <button
                  className={`subjectHeader${isCollapsed ? ' collapsed' : ''}`}
                  onClick={() => toggleGroup(key)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="chev"><ChevronIcon /></span>
                  <span className="subjectName">{g.subject ?? 'other'}</span>
                  <span className="subjectCount">{gDone}/{g.items.length}</span>
                </button>
              )}
              {!isCollapsed && g.items.map((item) => (
                <div key={item.id} className={`todoItem${editingId === item.id ? ' active' : ''}`}>
                  <button
                    className={`checkbox${item.done ? ' done' : ''}`}
                    aria-label={item.done ? 'Mark not done' : 'Mark done'}
                    onClick={() => onToggle(item.id)}
                  >
                    {item.done && <CheckIcon />}
                  </button>
                  {editingId === item.id ? (
                    <input
                      className="todoEdit"
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <span
                      className={`todoText${item.done ? ' done' : ''}`}
                      onClick={() => { setEditingId(item.id); setEditText(item.text) }}
                    >
                      {item.text}
                    </span>
                  )}
                  <button className="removeBtn" aria-label="Remove" onClick={() => onRemove(item.id)}>
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
            )
          })}
          {addRow}
        </div>
      )}
    </div>
  )
}
