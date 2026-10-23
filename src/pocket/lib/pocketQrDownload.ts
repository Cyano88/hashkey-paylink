import { Capacitor, registerPlugin } from '@capacitor/core'

const nativeQr = registerPlugin<{ saveQr(options: { base64: string }): Promise<{ cancelled?: boolean }> }>('PocketStatement')

export async function downloadPocketQr(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL('image/png')
  if (Capacitor.getPlatform() === 'android') {
    const result = await nativeQr.saveQr({ base64: dataUrl.split(',')[1] })
    if (result?.cancelled) throw new DOMException('Save cancelled', 'AbortError')
    return
  }
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = 'pocket-pos-qr.png'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
