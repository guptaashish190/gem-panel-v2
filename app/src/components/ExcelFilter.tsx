import { useEffect, useRef, useState } from 'react'

export function ExcelFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[] | null
  onChange: (next: string[] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const chosen = selected ?? options
  const allOn = options.length === 0 || options.every((option) => chosen.includes(option))
  const shown = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
  const caption = allOn ? label : chosen.length === 1 ? chosen[0] : chosen.length === 0 ? 'None' : `${chosen.length} selected`

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(value: string) {
    const next = new Set(chosen)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    const picked = options.filter((option) => next.has(option))
    onChange(picked.length === options.length ? null : picked)
  }

  return (
    <div className="excel" ref={box}>
      <button
        type="button"
        className={allOn ? 'excel-btn' : 'excel-btn on'}
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setQuery('')
          setOpen((value) => !value)
        }}
      >
        <span>{caption}</span>
        <i className="caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="excel-menu" role="group" aria-label={label}>
          <input
            value={query}
            placeholder="Search"
            aria-label={`Search ${label}`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="excel-option">
            <input
              type="checkbox"
              checked={allOn}
              ref={(input) => {
                if (input) input.indeterminate = !allOn && chosen.length > 0
              }}
              onChange={() => onChange(allOn ? [] : null)}
            />
            <span>Select all</span>
          </label>
          {shown.map((option) => (
            <label key={option} className="excel-option">
              <input type="checkbox" checked={chosen.includes(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
          {shown.length === 0 ? <p className="excel-empty">No matching values</p> : null}
        </div>
      ) : null}
    </div>
  )
}
