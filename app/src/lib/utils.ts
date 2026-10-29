import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * For dialogs opened from state rather than a Radix trigger: when the dialog closes, put keyboard focus back on
 * whatever had it when the dialog opened (Radix only knows how to return focus to its own trigger).
 */
export function useReturnFocus(handlers: { onOpenAutoFocus?: (e: Event) => void; onCloseAutoFocus?: (e: Event) => void }) {
  const returnTo = React.useRef<HTMLElement | null>(null)
  return {
    // Runs as the content mounts, before focus moves into it
    onOpenAutoFocus: (e: Event) => { returnTo.current = document.activeElement as HTMLElement | null; handlers.onOpenAutoFocus?.(e) },
    onCloseAutoFocus: (e: Event) => {
      handlers.onCloseAutoFocus?.(e)
      const el = returnTo.current
      if (e.defaultPrevented || !el?.isConnected || el === document.body) return
      e.preventDefault()
      el.focus({ preventScroll: true })
    },
  }
}
