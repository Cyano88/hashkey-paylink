import { Capacitor, registerPlugin } from '@capacitor/core'

const nativeReceipt = registerPlugin<{ share(options: { name: string; mimeType: string; base64: string }): Promise<void> }>('PocketReceipt')

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Receipt could not be prepared.'))
    reader.onload = () => {
      const encoded = String(reader.result || '').split(',')[1]
      if (!encoded) reject(new Error('Receipt could not be prepared.'))
      else resolve(encoded)
    }
    reader.readAsDataURL(file)
  })
}

export async function shareReceiptFile(file: File, title: string) {
  if (Capacitor.getPlatform() === 'android') {
    await nativeReceipt.share({ name: file.name.replace(/[^a-zA-Z0-9._-]/g, '-'), mimeType: file.type, base64: await fileBase64(file) })
    return
  }
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title, files: [file] })
    return
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
