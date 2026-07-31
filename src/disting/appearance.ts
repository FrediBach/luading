export const TEXT_SIZE_STORAGE_KEY = 'luading-text-size'

export type TextSize = 'small' | 'standard' | 'large'

export const TEXT_SIZE_OPTIONS: ReadonlyArray<{
  id: TextSize
  label: string
  percentage: number
}> = [
  { id: 'small', label: 'Small', percentage: 90 },
  { id: 'standard', label: 'Standard', percentage: 100 },
  { id: 'large', label: 'Large', percentage: 115 },
]

export function storedTextSize(
  storage?: Pick<Storage, 'getItem'>,
): TextSize {
  if (!storage) return 'standard'

  try {
    const value = storage.getItem(TEXT_SIZE_STORAGE_KEY)
    return TEXT_SIZE_OPTIONS.some((option) => option.id === value)
      ? value as TextSize
      : 'standard'
  } catch {
    return 'standard'
  }
}

export function persistTextSize(
  textSize: TextSize,
  storage?: Pick<Storage, 'setItem'>,
): void {
  if (!storage) return

  try {
    storage.setItem(TEXT_SIZE_STORAGE_KEY, textSize)
  } catch {
    // Readability preferences are optional when storage is unavailable.
  }
}

export function editorTypography(textSize: TextSize) {
  switch (textSize) {
    case 'small':
      return { fontSize: 12.5, lineHeight: 21 }
    case 'large':
      return { fontSize: 16, lineHeight: 25 }
    default:
      return { fontSize: 14, lineHeight: 22 }
  }
}
