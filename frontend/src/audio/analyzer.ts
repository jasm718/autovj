export type AudioFrame = {
  energy: number
  bassEnergy: number
  midEnergy: number
  highEnergy: number
  beat: boolean
  beatStrength: number
  bpm: number
}

export type MusicWindowSummary = AudioFrame & {
  windowSeconds: number
  beatDensity: number
  moodHint: string
}

export type AudioAnalysisResult = AudioFrame & {
  spectralCentroid: number
}

export type AnalysisHistorySample = {
  time: number
  energy: number
  bassEnergy: number
  midEnergy: number
  highEnergy: number
  beatStrength: number
  beat: boolean
}

export const SILENT_AUDIO_FRAME: AudioFrame = {
  energy: 0,
  bassEnergy: 0,
  midEnergy: 0,
  highEnergy: 0,
  beat: false,
  beatStrength: 0,
  bpm: 0,
}

const MIN_BEAT_INTERVAL_SECONDS = 0.24
const MAX_HISTORY_SECONDS = 300

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

function averageAbsoluteAmplitude(timeDomainData: Uint8Array): number {
  if (timeDomainData.length === 0) {
    return 0
  }

  let total = 0

  for (let index = 0; index < timeDomainData.length; index += 1) {
    total += Math.abs((timeDomainData[index] - 128) / 128)
  }

  return total / timeDomainData.length
}

function getAverageFrequencyRange(
  frequencyData: Uint8Array,
  sampleRate: number,
  fftSize: number,
  minHz: number,
  maxHz: number,
): number {
  if (frequencyData.length === 0 || sampleRate <= 0 || fftSize <= 0) {
    return 0
  }

  const nyquist = sampleRate / 2
  const startIndex = Math.max(0, Math.floor((minHz / nyquist) * frequencyData.length))
  const endIndex = Math.min(frequencyData.length, Math.ceil((maxHz / nyquist) * frequencyData.length))

  if (endIndex <= startIndex) {
    return 0
  }

  let total = 0

  for (let index = startIndex; index < endIndex; index += 1) {
    total += frequencyData[index] / 255
  }

  return total / (endIndex - startIndex)
}

function computeSpectralCentroid(frequencyData: Uint8Array, sampleRate: number): number {
  if (frequencyData.length === 0 || sampleRate <= 0) {
    return 0
  }

  let weightedTotal = 0
  let magnitudeTotal = 0

  for (let index = 0; index < frequencyData.length; index += 1) {
    const magnitude = frequencyData[index] / 255
    const frequency = (index / frequencyData.length) * (sampleRate / 2)
    weightedTotal += magnitude * frequency
    magnitudeTotal += magnitude
  }

  if (magnitudeTotal <= 0.0001) {
    return 0
  }

  const centroidHz = weightedTotal / magnitudeTotal
  return clamp(centroidHz / 8000, 0, 1)
}

export function analyzeAudioFrame(input: {
  frequencyData: Uint8Array
  timeDomainData: Uint8Array
  sampleRate: number
  fftSize: number
  now: number
  energyHistory: number[]
  beatTimes: number[]
  lastBeatTime: number
}): AudioAnalysisResult {
  const bassEnergy = getAverageFrequencyRange(input.frequencyData, input.sampleRate, input.fftSize, 20, 180)
  const midEnergy = getAverageFrequencyRange(input.frequencyData, input.sampleRate, input.fftSize, 180, 2200)
  const highEnergy = getAverageFrequencyRange(input.frequencyData, input.sampleRate, input.fftSize, 2200, 9000)
  const amplitudeEnergy = averageAbsoluteAmplitude(input.timeDomainData)
  const weightedEnergy = bassEnergy * 0.44 + midEnergy * 0.32 + highEnergy * 0.24
  const energy = clamp(weightedEnergy * 0.78 + amplitudeEnergy * 0.52, 0, 1)

  const historyAverage = average(input.energyHistory)
  const bassBoost = Math.max(0, bassEnergy - average(input.energyHistory.slice(-12)))
  const energyRise = Math.max(0, energy - historyAverage)
  const beatStrength = clamp(energyRise * 2.6 + bassBoost * 1.9 + Math.max(0, bassEnergy - midEnergy) * 0.8, 0, 1)
  const minBeatIntervalReached = input.now - input.lastBeatTime >= MIN_BEAT_INTERVAL_SECONDS
  const beat = minBeatIntervalReached && beatStrength > 0.24 && bassEnergy > 0.18

  let bpm = 0
  if (input.beatTimes.length >= 2) {
    const intervals: number[] = []
    for (let index = 1; index < input.beatTimes.length; index += 1) {
      const interval = input.beatTimes[index] - input.beatTimes[index - 1]
      if (interval >= MIN_BEAT_INTERVAL_SECONDS && interval <= 2) {
        intervals.push(interval)
      }
    }

    if (intervals.length > 0) {
      bpm = clamp(60 / average(intervals), 0, 220)
    }
  }

  return {
    energy,
    bassEnergy,
    midEnergy,
    highEnergy,
    beat,
    beatStrength,
    bpm,
    spectralCentroid: computeSpectralCentroid(input.frequencyData, input.sampleRate),
  }
}

export function summarizeMusicWindow(
  history: AnalysisHistorySample[],
  bpmEstimate: number,
  windowSeconds: number,
  now: number,
): MusicWindowSummary {
  const startTime = now - windowSeconds
  const windowHistory = history.filter((sample) => sample.time >= startTime)

  if (windowHistory.length === 0) {
    return {
      ...SILENT_AUDIO_FRAME,
      windowSeconds,
      beatDensity: 0,
      moodHint: 'idle',
    }
  }

  const energy = average(windowHistory.map((sample) => sample.energy))
  const bassEnergy = average(windowHistory.map((sample) => sample.bassEnergy))
  const midEnergy = average(windowHistory.map((sample) => sample.midEnergy))
  const highEnergy = average(windowHistory.map((sample) => sample.highEnergy))
  const beatStrength = average(windowHistory.map((sample) => sample.beatStrength))
  const beatCount = windowHistory.filter((sample) => sample.beat).length
  const beatDensity = clamp(beatCount / Math.max(1, windowSeconds * 4), 0, 1)
  const bpm = clamp(bpmEstimate, 0, 220)

  let moodHint = 'steady'
  if (energy < 0.08) {
    moodHint = 'ambient'
  } else if (bassEnergy > 0.56 && beatDensity > 0.34) {
    moodHint = 'intense'
  } else if (highEnergy > bassEnergy + 0.08) {
    moodHint = 'shimmer'
  } else if (midEnergy > 0.34 && energy > 0.2) {
    moodHint = 'groove'
  } else if (beatDensity < 0.12) {
    moodHint = 'dreamy'
  }

  return {
    energy: clamp(energy, 0, 1),
    bassEnergy: clamp(bassEnergy, 0, 1),
    midEnergy: clamp(midEnergy, 0, 1),
    highEnergy: clamp(highEnergy, 0, 1),
    beat: beatStrength > 0.22,
    beatStrength: clamp(beatStrength, 0, 1),
    bpm,
    windowSeconds,
    beatDensity,
    moodHint,
  }
}

export function trimAnalysisHistory(history: AnalysisHistorySample[], now: number): AnalysisHistorySample[] {
  return history.filter((sample) => now - sample.time <= MAX_HISTORY_SECONDS)
}

export function createDemoAudioFrame(time: number): AudioFrame {
  const bpm = 128
  const beatInterval = 60 / bpm
  const beatPhase = (time % beatInterval) / beatInterval
  const beatStrength = clamp(1 - beatPhase / 0.16, 0, 1)

  const bassWave = Math.sin(time * 2.4) * 0.18 + Math.sin(time * 0.75) * 0.08
  const midWave = Math.sin(time * 1.35 + 1.4) * 0.16 + Math.cos(time * 0.48) * 0.07
  const highWave = Math.sin(time * 4.8 + 0.5) * 0.18 + Math.cos(time * 2.7) * 0.06

  const bassEnergy = clamp(0.52 + bassWave + beatStrength * 0.3, 0, 1)
  const midEnergy = clamp(0.48 + midWave + beatStrength * 0.18, 0, 1)
  const highEnergy = clamp(0.42 + highWave + beatStrength * 0.12, 0, 1)
  const energy = clamp(bassEnergy * 0.45 + midEnergy * 0.3 + highEnergy * 0.25, 0, 1)

  return {
    energy,
    bassEnergy,
    midEnergy,
    highEnergy,
    beat: beatStrength > 0.35,
    beatStrength,
    bpm,
  }
}

export function createDemoMusicWindowSummary(time: number, windowSeconds = 30): MusicWindowSummary {
  const frame = createDemoAudioFrame(time)

  return {
    ...frame,
    windowSeconds,
    beatDensity: clamp(0.62 + Math.sin(time * 0.18) * 0.12, 0, 1),
    moodHint: frame.energy > 0.62 ? 'intense' : 'dreamy',
  }
}
