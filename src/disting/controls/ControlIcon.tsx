export type ControlIconName =
  | 'play'
  | 'pause'
  | 'reload'
  | 'clock'
  | 'sync'
  | 'speaker'
  | 'scope'
  | 'reset'
  | 'save'
  | 'warning'
  | 'error'
  | 'drawer'
  | 'menu'
  | 'trigger'
  | 'midi'
  | 'code'
  | 'patch'
  | 'monitor'
  | 'compact'
  | 'close'

interface Props {
  name: ControlIconName
  size?: number
  className?: string
}

function IconPaths({ name }: { name: ControlIconName }) {
  switch (name) {
    case 'play':
      return <path d="M7 4.8 15.5 10 7 15.2Z" />
    case 'pause':
      return <path d="M6 5h3v10H6Zm5 0h3v10h-3Z" />
    case 'reload':
      return <path d="M15.2 7.2A6 6 0 1 0 16 12h-2a4 4 0 1 1-.7-2.3L10.8 12H17V5.8Z" />
    case 'clock':
      return <path d="M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Zm.9 3.1H9.1v4.6l3.7 2.2.9-1.5-2.8-1.7Z" />
    case 'sync':
      return <path d="M4.2 8A6.2 6.2 0 0 1 15 5.7V3h1.8v6H11V7.2h2.8A4.4 4.4 0 0 0 6 8Zm11.6 4A6.2 6.2 0 0 1 5 14.3V17H3.2v-6H9v1.8H6.2A4.4 4.4 0 0 0 14 12Z" />
    case 'speaker':
      return <path d="M3 8h3l4-3.3v10.6L6 12H3Zm9.3-.7a4 4 0 0 1 0 5.4l1.3 1.3a5.8 5.8 0 0 0 0-8Zm2.5-2.5a7.5 7.5 0 0 1 0 10.4l1.3 1.3a9.3 9.3 0 0 0 0-13Z" />
    case 'scope':
      return <path d="M2.5 10h2.8l1.6-4 2.6 8 2.2-6 1.4 2h4.4v1.8h-5.3l-.1-.2-2.9 7.7-2.5-7.7-.2.2h-4Z" />
    case 'reset':
      return <path d="M5.1 6.2V3.5H3.3v6h6V7.7H6.4A4.7 4.7 0 1 1 5.8 13l-1.5 1a6.5 6.5 0 1 0 .8-7.8Z" />
    case 'save':
      return <path d="M3 3h12l2 2v12H3Zm3 1.8v4.1h8V4.8Zm0 7V16h8v-4.2Z" />
    case 'warning':
      return <path d="M10 2.3 18 17H2Zm-.9 5v5h1.8v-5Zm0 6.6v1.8h1.8v-1.8Z" />
    case 'error':
      return <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM7 5.8 10 8.7l3-3L14.2 7l-3 3 3 3-1.3 1.2-2.9-3-3 3L5.8 13l3-3-3-3Z" />
    case 'drawer':
      return <path d="M3 3h14v14H3Zm1.8 1.8v7.4h10.4V4.8Zm0 9.2v1.2h10.4V14Zm3-5.1L10 11l2.2-2.1 1.2 1.2-3.4 3.4-3.4-3.4Z" />
    case 'menu':
      return <path d="M3 5h14v2H3Zm0 4h14v2H3Zm0 4h14v2H3Z" />
    case 'trigger':
      return <path d="M2 11h4V6h5v8h3V9h4v2h-2v5h-7V8H8v5H2Z" />
    case 'midi':
      return <path d="M4.4 4.2A8 8 0 0 1 10 2a8 8 0 0 1 5.6 2.2l-1.2 1.4A6.2 6.2 0 0 0 10 3.8a6.2 6.2 0 0 0-4.4 1.8Zm2 2.5A5 5 0 0 1 10 5.3a5 5 0 0 1 3.6 1.4l-1.2 1.4a3.3 3.3 0 0 0-4.8 0ZM9 9h2v8H9Z" />
    case 'code':
      return <path d="m7.2 5-5 5 5 5 1.3-1.4L4.9 10l3.6-3.6Zm5.6 0-1.3 1.4 3.6 3.6-3.6 3.6 1.3 1.4 5-5Z" />
    case 'patch':
      return <path d="M5 3a2.5 2.5 0 0 1 1 4.8V9h3v2H4V7.8A2.5 2.5 0 0 1 5 3Zm10 9a2.5 2.5 0 1 1-1 4.8V15h-3v-2h5v3.8a2.5 2.5 0 0 1-1-4.8Z" />
    case 'monitor':
      return <path d="M2.5 3.5h15v11h-6.6v1.8h3V18H6v-1.7h3v-1.8H2.5Zm1.8 1.8v7.4h11.4V5.3Z" />
    case 'compact':
      return <path d="M3 3h6v6H3Zm8 0h6v6h-6ZM3 11h6v6H3Zm8 0h6v6h-6ZM5 5v2h2V5Zm8 0v2h2V5Zm-8 8v2h2v-2Zm8 0v2h2v-2Z" />
    case 'close':
      return <path d="m5.4 4.2 4.6 4.6 4.6-4.6 1.2 1.2-4.6 4.6 4.6 4.6-1.2 1.2-4.6-4.6-4.6 4.6-1.2-1.2L8.8 10 4.2 5.4Z" />
  }
}

export function ControlIcon({ name, size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <IconPaths name={name} />
    </svg>
  )
}

