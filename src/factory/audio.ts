// Los efectos y la fanfarria se sintetizan con Web Audio; la música de fondo son canciones

export type Sfx =
  | 'break'
  | 'place'
  | 'jump'
  | 'bounce'
  | 'gift'
  | 'splash'
  | 'coin'
  | 'door'
  | 'locked'
  | 'secret'
  | 'click'
  | 'shoot'
  | 'swing'
  | 'hit'
  | 'clang'
  | 'slam'
  | 'roar'
  | 'checkpoint'
  | 'bossdown'
  | 'hurt'
  | 'warp'
  | 'win'
  | 'lose'

type Note = [string | 0, number]

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const freq = (name: string) => {
  const sharp = name[1] === '#'
  const midi = SEMITONES[name[0]] + (sharp ? 1 : 0) + (Number(name.slice(sharp ? 2 : 1)) + 1) * 12
  return 440 * 2 ** ((midi - 69) / 12)
}
const seq = (text: string): Note[] =>
  text
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [name, beats] = token.split(':')
      return [name === '-' ? 0 : name, Number(beats ?? 1)]
    })

export type Track = 'hub' | 'stage' | 'boss'

// Canción de cada zona; cada jefe tiene siempre la misma según su día
const SONGS: Record<Track, string[]> = {
  hub: ['/music/village-at-christmas.mp3'],
  stage: ['/music/jade-elf-quest.mp3'],
  boss: ['/music/santas-sleigh-stop.mp3', '/music/boss-battle-hook.mp3'],
}

// Fanfarria de victoria, homenaje a las de los JRPG: tresillo de metales sobre la tónica,
// cadencia bVI-bVII-I y un vamp con bajo saltarín
const FANFARE = {
  beat: 0.18,
  voices: [
    seq(`C6:.34 C6:.33 C6:.33 C6:2 D#6:2 D6:2 E6:1.34 G6:.66 C7:3
      -:.5 E6:.5 G6 E6:.5 C6:1.5 -:.5 D6:.5 F6 D6:.5 A#5:1.5
      -:.5 C6:.5 D#6 C6:.5 G#5:1.5 D6:.5 G6:.5 B6 G6:.5 B6:.5 D7 C7:3`),
    seq(`G5:.34 G5:.33 G5:.33 G5:2 C6:2 A#5:2 C6:1.34 E6:.66 G6:3
      -:.5 C6:.5 E6 C6:.5 G5:1.5 -:.5 A#5:.5 D6 A#5:.5 F5:1.5
      -:.5 G#5:.5 C6 G#5:.5 D#5:1.5 B5:.5 D6:.5 G6 D6:.5 G6:.5 B6 G6:3`),
    seq(`E5:.34 E5:.33 E5:.33 E5:2 G#5:2 F5:2 G5:1.34 C6:.66 E6:3`),
  ],
  bass: seq(`C3 C3:2 G#2:2 A#2:2 C3 C3 C3:3
    C3:.5 C4:.5 G3:.5 C4:.5 C3:.5 C4:.5 G3:.5 C4:.5 A#2:.5 A#3:.5 F3:.5 A#3:.5 A#2:.5 A#3:.5 F3:.5 A#3:.5
    G#2:.5 G#3:.5 D#3:.5 G#3:.5 G#2:.5 G#3:.5 D#3:.5 G#3:.5 G2:.5 G3:.5 D3:.5 G3:.5 G2:.5 G3:.5 B2:.5 D3:.5 C3:3`),
}
const FANFARE_INTRO = 12

const VOLUME = 2.4
// De fondo, muy por debajo de los efectos
const SONG_VOLUME = 0.12

export function createAudio(muted: boolean) {
  let ctx: AudioContext | null = null
  let master: GainNode
  let noiseBuffer: AudioBuffer
  let meter: AnalyserNode
  let track: Track = 'hub'
  let songDay = 0
  // Tras la fanfarria la música calla hasta el siguiente setTrack
  let quiet = false
  // Un solo elemento para todas las canciones: en iOS basta con desbloquearlo una vez
  let song: HTMLAudioElement | null = null
  let songGain: GainNode
  let songTimer = 0
  let active = true
  // Por dónde iba cada canción, para retomar la de la fábrica al volver
  const songAt = new Map<string, number>()

  const tone = (
    out: AudioNode,
    type: OscillatorType,
    from: number,
    to: number,
    at: number,
    length: number,
    volume: number
  ) => {
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + length)
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + length + 0.02)
  }

  const noise = (out: AudioNode, at: number, length: number, volume: number, cutoff: number, type: BiquadFilterType = 'lowpass') => {
    const source = ctx!.createBufferSource()
    const filter = ctx!.createBiquadFilter()
    const gain = ctx!.createGain()
    source.buffer = noiseBuffer
    filter.type = type
    filter.frequency.value = cutoff
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    source.connect(filter).connect(gain).connect(out)
    source.start(at, Math.random() * 0.5, length + 0.02)
  }

  const arpeggio = (notes: string[], type: OscillatorType, gap: number, volume: number) => {
    const now = ctx!.currentTime
    notes.forEach((name, i) => tone(master, type, freq(name), freq(name), now + i * gap, gap * 2.2, volume))
  }

  // Suena la canción de la zona si hay sonido y la pestaña está a la vista; al cambiar, funde y la sustituye
  const syncSong = () => {
    if (!ctx || !song) return
    const el = song
    const list = SONGS[track]
    const want = muted || quiet || !active ? '' : list[songDay % list.length]
    const current = el.getAttribute('src') ?? ''
    clearTimeout(songTimer)
    if (want && want === current) {
      songGain.gain.setTargetAtTime(SONG_VOLUME, ctx.currentTime, 0.6)
      el.play().catch(() => {})
      return
    }
    const swap = () => {
      if (current) songAt.set(current, el.currentTime)
      el.pause()
      if (!want) return
      el.src = want
      el.currentTime = songAt.get(want) ?? 0
      songGain.gain.setTargetAtTime(SONG_VOLUME, ctx!.currentTime, 0.6)
      el.play().catch(() => {})
    }
    songGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
    if (!current || el.paused) swap()
    else songTimer = window.setTimeout(swap, 600)
  }

  const apply = () => master?.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx!.currentTime, 0.05)

  return {
    get muted() {
      return muted
    },
    // Hay que llamarlo desde un gesto del usuario
    start() {
      if (ctx) {
        ctx.resume()
        return syncSong()
      }
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : VOLUME
      // Un limitador al final: los golpes fuertes no saturan
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -10
      limiter.ratio.value = 12
      limiter.attack.value = 0.003
      limiter.release.value = 0.12
      master.connect(limiter).connect(ctx.destination)
      meter = ctx.createAnalyser()
      limiter.connect(meter)
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      song = new Audio()
      song.loop = true
      songGain = ctx.createGain()
      songGain.gain.value = 0
      ctx.createMediaElementSource(song).connect(songGain).connect(master)
      syncSong()
    },
    // Funde lo que suena y arranca la canción de la zona; day elige la del jefe
    setTrack(next: Track, day = 0) {
      if (next === track && day === songDay && !quiet) return
      track = next
      songDay = day
      quiet = false
      // Fases y jefes empiezan su canción desde el principio; la fábrica sigue por donde iba
      if (next !== 'hub') for (const url of SONGS[next]) songAt.delete(url)
      syncSong()
    },
    // Calla la música de la fase y toca la fanfarria; el siguiente setTrack la retoma
    fanfare() {
      if (!ctx || ctx.state !== 'running') return
      quiet = true
      syncSong()
      const { beat } = FANFARE
      const start = ctx.currentTime + 0.06
      const line = (notes: Note[], type: OscillatorType, volume: number, hold: number) => {
        let t = start
        for (const [name, beats] of notes) {
          if (name) {
            const f = freq(name)
            tone(master, type, f, f, t, Math.max(0.12, beats * beat * hold), volume)
            if (beats >= 3) tone(master, type, f * 1.004, f * 1.004, t, beats * beat * 1.6, volume * 0.7)
          }
          t += beats * beat
        }
        return t
      }
      FANFARE.voices.forEach((voice, i) => line(voice, 'square', i ? 0.045 : 0.1, 1.1))
      const end = line(FANFARE.bass, 'triangle', 0.19, 0.9)
      // Redoble de entrada, charles a contratiempo y platillo en cada llegada
      for (let i = 0; i < 6; i++) noise(master, start + (i * beat) / 6, 0.04, 0.07 + i * 0.012, 4500, 'highpass')
      for (let t = start + (FANFARE_INTRO + 0.5) * beat; t < end - 3 * beat; t += beat) {
        noise(master, t, 0.05, 0.06, 5000, 'highpass')
      }
      noise(master, start + 7 * beat, 0.6, 0.1, 6000, 'highpass')
      noise(master, end - 3 * beat, 0.9, 0.12, 6000, 'highpass')
    },
    setMuted(value: boolean) {
      muted = value
      if (ctx) apply()
      syncSong()
    },
    // Con la pestaña oculta no suena nada
    setActive(value: boolean) {
      active = value
      if (!ctx) return
      if (active) ctx.resume()
      else ctx.suspend()
      syncSong()
    },
    play(name: Sfx) {
      if (!ctx || muted || ctx.state !== 'running') return
      const now = ctx.currentTime
      if (name === 'break') {
        noise(master, now, 0.09, 0.3, 1100)
        tone(master, 'square', 150, 70, now, 0.08, 0.12)
      } else if (name === 'place') tone(master, 'square', 230, 150, now, 0.07, 0.14)
      else if (name === 'jump') tone(master, 'square', 300, 520, now, 0.1, 0.06)
      else if (name === 'bounce') tone(master, 'triangle', 190, 950, now, 0.28, 0.25)
      else if (name === 'splash') noise(master, now, 0.3, 0.3, 500)
      else if (name === 'click') tone(master, 'square', 660, 660, now, 0.04, 0.07)
      else if (name === 'locked') {
        tone(master, 'square', 130, 110, now, 0.1, 0.13)
        tone(master, 'square', 130, 100, now + 0.13, 0.14, 0.13)
      } else if (name === 'coin') arpeggio(['B5', 'E6'], 'square', 0.07, 0.1)
      else if (name === 'gift') arpeggio(['E5', 'A5', 'C#6', 'E6', 'A6'], 'square', 0.05, 0.08)
      else if (name === 'door') arpeggio(['C5', 'E5', 'G5', 'C6'], 'triangle', 0.09, 0.22)
      else if (name === 'secret') arpeggio(['G4', 'C5', 'E5', 'G5', 'C6', 'E6'], 'square', 0.08, 0.1)
      else if (name === 'shoot') tone(master, 'square', 560, 240, now, 0.08, 0.05)
      else if (name === 'swing') noise(master, now, 0.1, 0.16, 2600, 'highpass')
      else if (name === 'hit') {
        noise(master, now, 0.06, 0.2, 1800)
        tone(master, 'square', 240, 110, now, 0.08, 0.12)
      } else if (name === 'clang') {
        tone(master, 'square', 1320, 1180, now, 0.12, 0.07)
        tone(master, 'triangle', 880, 860, now, 0.16, 0.12)
      } else if (name === 'slam') {
        noise(master, now, 0.4, 0.55, 190)
        tone(master, 'triangle', 80, 38, now, 0.35, 0.4)
      } else if (name === 'roar') tone(master, 'sawtooth', 120, 62, now, 0.55, 0.14)
      else if (name === 'hurt') tone(master, 'square', 210, 80, now, 0.22, 0.16)
      else if (name === 'warp') tone(master, 'triangle', 180, 1400, now, 0.55, 0.2)
      else if (name === 'checkpoint') arpeggio(['E5', 'B5', 'E6'], 'triangle', 0.08, 0.2)
      else if (name === 'bossdown') arpeggio(['C6', 'G5', 'E5', 'C5', 'G4', 'C4'], 'square', 0.09, 0.11)
      else if (name === 'win') arpeggio(['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6'], 'square', 0.11, 0.11)
      else if (name === 'lose') arpeggio(['G4', 'E4', 'C4', 'A3'], 'triangle', 0.16, 0.24)
    },
    // Nivel de la salida ahora mismo, para comprobar que suena y no satura
    level() {
      if (!ctx) return null
      const data = new Float32Array(meter.fftSize)
      meter.getFloatTimeDomainData(data)
      let peak = 0
      let sum = 0
      for (const v of data) {
        peak = Math.max(peak, Math.abs(v))
        sum += v * v
      }
      return { state: ctx.state, rms: Math.sqrt(sum / data.length), peak }
    },
    dispose() {
      clearTimeout(songTimer)
      song?.pause()
      song = null
      ctx?.close()
      ctx = null
    },
  }
}
