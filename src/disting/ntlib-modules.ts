const moduleFiles = import.meta.glob('../ntlib/*.lua', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export const NTLIB_MODULES = Object.freeze(Object.fromEntries(
  Object.entries(moduleFiles).map(([path, source]) => {
    const filename = path.split('/').at(-1) ?? ''
    const stem = filename.replace(/\.lua$/, '')
    return [stem === 'init' ? 'ntlib' : `ntlib.${stem}`, source]
  }),
))

export const NTLIB_EXPORT_MODULES = Object.freeze(Object.fromEntries(
  Object.entries(NTLIB_MODULES).filter(([name]) => name !== 'ntlib.test'),
))

export function runtimeModules(projectModules: Record<string, string>) {
  return { ...NTLIB_MODULES, ...projectModules }
}
