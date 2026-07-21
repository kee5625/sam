import { useRef, useState } from 'react'

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

interface Props {
  items: TodoItem[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onEdit: (id: string, text: string) => void
  onRemove: (id: string) => void
}

function CheckListIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(238,240,246,.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

export default function Todo({ items, onAdd, onToggle, onEdit, onRemove }: Props): JSX.Element {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const addRef = useRef<HTMLInputElement>(null)

  const doneCount = items.filter((i) => i.done).length

  const add = (): void => {
    if (!draft.trim()) return
    onAdd(draft.trim())
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

  return (
    <div className="card">
      <div className="cardHead">
        <span className="orb" />
        <span className="q">todo</span>
        {items.length > 0
          ? <span className="todoCount">{doneCount} of {items.length} done</span>
          : <span className="todoBadge">Todo</span>}
      </div>

      {items.length === 0 ? (
        <div className="todoEmpty">
          <div className="todoEmptyIcon"><CheckListIcon /></div>
          <div className="todoEmptyTitle">No todos yet</div>
          <div className="todoEmptyHint">
            Start typing below to add your first item — press <span className="kbd">Enter</span> to save each one.
          </div>
          <div className="addRow" style={{ width: 340 }}>
            <PlusIcon />
            <input
              ref={addRef}
              value={draft}
              placeholder="Add a todo…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            />
          </div>
        </div>
      ) : (
        <div className="todoList">
          {items.map((item) => (
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
          <div className="addRow">
            <PlusIcon />
            <input
              ref={addRef}
              value={draft}
              placeholder="Add a todo…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
