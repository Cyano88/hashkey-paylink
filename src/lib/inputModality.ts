/** Shared focus policy. Text inputs match :focus-visible on touch in Chromium,
 * so track navigation intent explicitly instead of relying on that selector. */
export function installInputModality(doc: Document = document) {
  const root = doc.documentElement
  root.dataset.inputModality = 'pointer'
  const pointer = () => { root.dataset.inputModality = 'pointer' }
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) root.dataset.inputModality = 'keyboard'
  }
  doc.addEventListener('pointerdown', pointer, true)
  doc.addEventListener('keydown', keyboard, true)
  return () => {
    doc.removeEventListener('pointerdown', pointer, true)
    doc.removeEventListener('keydown', keyboard, true)
    delete root.dataset.inputModality
  }
}
