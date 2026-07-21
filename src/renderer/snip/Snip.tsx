import { useEffect, useRef, useState } from 'react'
import './snip.css'

interface Rect { x: number; y: number; w: number; h: number }

export default function Snip(): JSX.Element {
  const [shot, setShot] = useState<string | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    void window.sam.invoke('config:get').then((c) => {
      const accent = (c as { accent?: string }).accent === 'green' ? 'green' : 'blue'
      document.documentElement.setAttribute('data-accent', accent)
    })
    const off = window.sam.on('snip:show', (...args: unknown[]) => setShot(args[0] as string))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.sam.invoke('snip:cancel')
    }
    window.addEventListener('keydown', onKey)
    return () => { off(); window.removeEventListener('keydown', onKey) }
  }, [])

  function crop(r: Rect): void {
    const img = imgRef.current
    if (!img || r.w < 5 || r.h < 5) return
    // screenshot is full physical resolution; viewport is logical pixels
    const scaleX = img.naturalWidth / window.innerWidth
    const scaleY = img.naturalHeight / window.innerHeight
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(r.w * scaleX)
    canvas.height = Math.round(r.h * scaleY)
    const c = canvas.getContext('2d')!
    c.drawImage(
      img,
      Math.round(r.x * scaleX), Math.round(r.y * scaleY),
      canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height
    )
    void window.sam.invoke('snip:done', canvas.toDataURL('image/png'))
  }

  if (!shot) return <div className="dim" />

  return (
    <div
      onMouseDown={(e) => { setStart({ x: e.clientX, y: e.clientY }); setRect(null) }}
      onMouseMove={(e) => {
        if (!start) return
        setRect({
          x: Math.min(start.x, e.clientX),
          y: Math.min(start.y, e.clientY),
          w: Math.abs(e.clientX - start.x),
          h: Math.abs(e.clientY - start.y)
        })
      }}
      onMouseUp={() => {
        if (rect) crop(rect)
        else void window.sam.invoke('snip:cancel')
        setStart(null)
      }}
    >
      <img ref={imgRef} className="shot" src={shot} alt="" draggable={false} />
      {!rect && <div className="dim" />}
      {rect && (
        <div className="rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          {rect.w > 0 && rect.h > 0 && (
            <span className="dims">{Math.round(rect.w)} × {Math.round(rect.h)}</span>
          )}
        </div>
      )}
      <div className="hint">
        <span>Drag to select a region</span>
        <span className="sep" />
        <span className="esc">Esc to cancel</span>
      </div>
    </div>
  )
}
