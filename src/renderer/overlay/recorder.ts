export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null

  async start(deviceId?: string | null): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    })
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' })
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data) }
    this.mediaRecorder.start()
  }

  stop(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder
      if (!mr) return reject(new Error('not recording'))
      mr.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        this.stream = null
        this.mediaRecorder = null
        resolve(await new Blob(this.chunks, { type: 'audio/webm' }).arrayBuffer())
      }
      mr.stop()
    })
  }
}
