import { desktopCapturer, screen } from 'electron'

/** Full-resolution screenshot of the primary display as a PNG data URL. */
export async function captureScreen(): Promise<string> {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.size
  const factor = display.scaleFactor
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * factor), height: Math.round(height * factor) }
  })
  const primary = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  return primary.thumbnail.toDataURL()
}
