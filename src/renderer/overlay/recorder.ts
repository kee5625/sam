export interface VoiceOpts {
  /** Called once when sustained silence (after speech) or the max cap is hit. */
  onSilence?: () => void
  /** Silence duration after speech that ends the recording. Default 1200ms. */
  silenceMs?: number
  /** Hard cap on total recording length. Default 15000ms. */
  maxMs?: number
  /** Minimum speech before silence can trigger a stop. Default 300ms. */
  minSpeechMs?: number
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private vadTimer: ReturnType<typeof setInterval> | null = null

  async start(deviceId?: string | null, opts: VoiceOpts = {}): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    })
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' })
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data) }
    this.mediaRecorder.start()
    if (opts.onSilence) this.startVad(opts)
  }

  /**
   * Voice-activity detection: polls mic RMS energy. Once the user has spoken,
   * a run of quiet longer than silenceMs (or hitting maxMs) fires onSilence,
   * which the caller uses to stop + transcribe automatically.
   */
  private startVad(opts: VoiceOpts): void {
    const silenceMs = opts.silenceMs ?? 1200
    const maxMs = opts.maxMs ?? 15000
    const minSpeechMs = opts.minSpeechMs ?? 300
    const THRESHOLD = 0.015 // RMS over float PCM (-1..1); ~quiet room floor

    this.audioCtx = new AudioContext()
    const src = this.audioCtx.createMediaStreamSource(this.stream!)
    const analyser = this.audioCtx.createAnalyser()
    analyser.fftSize = 2048
    src.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)

    const startTime = Date.now()
    let speechStart = 0
    let lastVoice = Date.now()
    let fired = false

    this.vadTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      const now = Date.now()

      if (rms > THRESHOLD) {
        if (!speechStart) speechStart = now
        lastVoice = now
      }
      const spokeEnough = speechStart > 0 && now - speechStart > minSpeechMs
      const silentLongEnough = now - lastVoice > silenceMs
      const tooLong = now - startTime > maxMs

      if (!fired && ((spokeEnough && silentLongEnough) || tooLong)) {
        fired = true
        opts.onSilence?.()
      }
    }, 80)
  }

  get recording(): boolean {
    return this.mediaRecorder !== null
  }

  stop(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder
      if (!mr) return reject(new Error('not recording'))
      if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null }
      void this.audioCtx?.close()
      this.audioCtx = null
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
