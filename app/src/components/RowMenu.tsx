import { useEffect, useRef } from 'react'
import type { Summary } from '../panel'

export type RowMenuState = {
  x: number
  y: number
  bidNumber: string
  saved: boolean
  pdf: Summary['pdf']
  waiting: boolean
}

export function RowMenu({
  menu,
  onClose,
  onOpenPdf,
  onSavePdf,
  onDelete,
}: {
  menu: RowMenuState
  onClose: () => void
  onOpenPdf: () => void
  onSavePdf: () => void
  onDelete?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 168))
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - (onDelete ? 128 : 92)))

  useEffect(() => {
    const first = box.current?.querySelector('button:not(:disabled)')
    if (first instanceof HTMLButtonElement) first.focus({ preventScroll: true })
    function onPointer(event: MouseEvent) {
      if (box.current?.contains(event.target as Node)) return
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={box}
      className="row-menu"
      role="menu"
      style={{ left, top }}
      aria-label={menu.bidNumber}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={menu.waiting || menu.pdf === 'upload'}
        onClick={() => {
          onClose()
          onOpenPdf()
        }}
      >
        Open PDF
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={menu.waiting}
        onClick={() => {
          onClose()
          onSavePdf()
        }}
      >
        {menu.saved ? 'Unsave' : 'Save PDF'}
      </button>
      {onDelete ? (
        <button
          type="button"
          role="menuitem"
          className="danger"
          disabled={menu.waiting}
          onClick={() => {
            onClose()
            onDelete()
          }}
        >
          Delete
        </button>
      ) : null}
    </div>
  )
}
