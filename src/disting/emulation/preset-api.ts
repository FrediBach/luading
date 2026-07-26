export type PresetParameter = {
  name: string
  min: number
  max: number
  value: number
}

type CompanionAlgorithmTemplate = {
  name: string
  parameters: Array<Omit<PresetParameter, 'value'> & { defaultValue: number }>
}

type CompanionAlgorithm = {
  name: string
  parameters: PresetParameter[]
}

const FIRST_COMPANION_ALGORITHM_INDEX = 2

const COMPANION_ALGORITHMS: CompanionAlgorithmTemplate[] = [
  {
    name: 'Looper',
    parameters: [
      { name: 'Record', min: 0, max: 1, defaultValue: 0 },
      { name: 'Fade to clear', min: 0, max: 1, defaultValue: 0 },
    ],
  },
]

export class DistingPresetApi {
  private algorithms: CompanionAlgorithm[] = []

  constructor() {
    this.reset()
  }

  reset() {
    this.algorithms = COMPANION_ALGORITHMS.map((algorithm) => ({
      name: algorithm.name,
      parameters: algorithm.parameters.map((parameter) => ({
        ...parameter,
        value: parameter.defaultValue,
      })),
    }))
  }

  findAlgorithm(name: unknown) {
    return this.findAlgorithms(name)?.[0]
  }

  findAlgorithms(name: unknown) {
    if (typeof name !== 'string') return undefined
    const matches = this.algorithms.flatMap((algorithm, index) => (
      algorithm.name === name ? [FIRST_COMPANION_ALGORITHM_INDEX + index] : []
    ))
    return matches.length > 0 ? matches : undefined
  }

  findParameter(algorithmIndex: unknown, name: unknown) {
    return this.findParameters(algorithmIndex, name)?.[0]
  }

  findParameters(algorithmIndex: unknown, name: unknown) {
    if (typeof name !== 'string') return undefined
    const algorithm = this.algorithm(algorithmIndex)
    if (!algorithm) return undefined
    const matches = algorithm.parameters.flatMap((parameter, index) => (
      parameter.name === name ? [index + 1] : []
    ))
    return matches.length > 0 ? matches : undefined
  }

  getAlgorithmCount() {
    return 1 + this.algorithms.length
  }

  getAlgorithmName(algorithmIndex: unknown) {
    return this.algorithm(algorithmIndex)?.name
  }

  getParameterCount(algorithmIndex: unknown) {
    return this.algorithm(algorithmIndex)?.parameters.length
  }

  getParameterName(algorithmIndex: unknown, parameterIndex: unknown) {
    return this.parameter(algorithmIndex, parameterIndex)?.name
  }

  setParameter(algorithmIndex: unknown, parameterIndex: unknown, value: unknown) {
    const parameter = this.parameter(algorithmIndex, parameterIndex)
    if (!parameter || typeof value !== 'number' || !Number.isFinite(value)) return false
    parameter.value = Math.min(parameter.max, Math.max(parameter.min, value))
    return true
  }

  getParameter(algorithmIndex: unknown, parameterIndex: unknown) {
    return this.parameter(algorithmIndex, parameterIndex)?.value
  }

  setParameterNormalized(algorithmIndex: unknown, parameterIndex: unknown, value: unknown) {
    const parameter = this.parameter(algorithmIndex, parameterIndex)
    if (!parameter || typeof value !== 'number' || !Number.isFinite(value)) return false
    return this.setParameter(
      algorithmIndex,
      parameterIndex,
      parameter.min + Math.min(1, Math.max(0, value)) * (parameter.max - parameter.min),
    )
  }

  getParameterInfo(algorithmIndex: unknown, parameterIndex: unknown) {
    return this.parameter(algorithmIndex, parameterIndex)
  }

  private algorithm(index: unknown) {
    if (typeof index !== 'number' || !Number.isFinite(index)) return undefined
    return this.algorithms[Math.trunc(index) - FIRST_COMPANION_ALGORITHM_INDEX]
  }

  private parameter(algorithmIndex: unknown, parameterIndex: unknown) {
    if (typeof parameterIndex !== 'number' || !Number.isFinite(parameterIndex)) return undefined
    return this.algorithm(algorithmIndex)?.parameters[Math.trunc(parameterIndex) - 1]
  }
}
