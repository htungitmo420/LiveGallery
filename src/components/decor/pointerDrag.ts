export function trackPointerDrag(
  pointerId: number,
  onMove: (event: PointerEvent) => void,
  onStop?: () => void,
): () => void {
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return
    onMove(next)
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    onStop?.()
  }

  const stop = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return
    cleanup()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
  return cleanup
}
