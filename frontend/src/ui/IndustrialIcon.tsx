import type { SVGProps } from 'react'

export type IndustrialIconName =
  | 'upload'
  | 'sparkles'
  | 'eye'
  | 'edit'
  | 'save'
  | 'undo'
  | 'redo'
  | 'top'
  | 'front'
  | 'cube'
  | 'walk'
  | 'reset'
  | 'close'
  | 'photo'
  | 'scan'
  | 'box'
  | 'copy'
  | 'trash'
  | 'rotate'
  | 'search'
  | 'check'
  | 'warning'
  | 'plus'
  | 'history'
  | 'cursor'
  | 'grid'
  | 'chevron'

interface IndustrialIconProps extends SVGProps<SVGSVGElement> {
  name: IndustrialIconName
  size?: number
}

/** Small dependency-free icon set used by the industrial workspace shell. */
export function IndustrialIcon({
  name,
  size = 18,
  ...props
}: IndustrialIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  let path
  switch (name) {
    case 'upload':
      path = <><path d="M12 16V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></>
      break
    case 'sparkles':
      path = <><path d="m12 3 1.2 3.1L16 7.5l-2.8 1.4L12 12l-1.2-3.1L8 7.5l2.8-1.4L12 3Z" /><path d="m18.5 12 .8 2.1 2.2.9-2.2.9-.8 2.1-.8-2.1-2.2-.9 2.2-.9.8-2.1Z" /><path d="m5.5 13 1 2.5L9 16.7l-2.5 1.1-1 2.7-1-2.7L2 16.7l2.5-1.2 1-2.5Z" /></>
      break
    case 'eye':
      path = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
      break
    case 'edit':
      path = <><path d="M13.5 5.5 18.5 10.5" /><path d="m4 20 3.5-.8L19.7 7a1.8 1.8 0 0 0 0-2.6 1.8 1.8 0 0 0-2.6 0L4.8 16.6 4 20Z" /></>
      break
    case 'save':
      path = <><path d="M4 4h13l3 3v13H4V4Z" /><path d="M8 4v6h8V4" /><path d="M8 20v-6h8v6" /></>
      break
    case 'undo':
      path = <><path d="m9 7-5 5 5 5" /><path d="M4 12h9a6 6 0 0 1 6 6" /></>
      break
    case 'redo':
      path = <><path d="m15 7 5 5-5 5" /><path d="M20 12h-9a6 6 0 0 0-6 6" /></>
      break
    case 'top':
      path = <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m7 11-4 2 9 5 9-5-4-2" /><path d="m7 16-4 2 9 5 9-5-4-2" /></>
      break
    case 'front':
      path = <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M8 20V9h8v11" /><path d="M8 13h8" /></>
      break
    case 'cube':
      path = <><path d="m12 2.8 8 4.5v9.4l-8 4.5-8-4.5V7.3l8-4.5Z" /><path d="m4.4 7.5 7.6 4.3 7.6-4.3" /><path d="M12 21V11.8" /></>
      break
    case 'walk':
      path = <><circle cx="13" cy="4" r="2" /><path d="m10 22 2-7-3-3 2-5 4 3 3 1" /><path d="m12 15 4 2 2 5" /><path d="M9 12 5 15" /></>
      break
    case 'reset':
      path = <><path d="M4.5 8.5A8 8 0 1 1 4 15" /><path d="M4.5 3.5v5h5" /><path d="M12 8v4l3 2" /></>
      break
    case 'close':
      path = <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>
      break
    case 'photo':
      path = <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.5 3.5 2-2L20 19" /></>
      break
    case 'scan':
      path = <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /><path d="M7 12h10" /></>
      break
    case 'box':
      path = <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 21v-9" /></>
      break
    case 'copy':
      path = <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>
      break
    case 'trash':
      path = <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>
      break
    case 'rotate':
      path = <><path d="M20 7v5h-5" /><path d="M18.4 17A8 8 0 1 1 20 12" /></>
      break
    case 'search':
      path = <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>
      break
    case 'check':
      path = <path d="m5 12 4 4L19 6" />
      break
    case 'warning':
      path = <><path d="M10.3 3.7 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>
      break
    case 'plus':
      path = <><path d="M12 5v14" /><path d="M5 12h14" /></>
      break
    case 'history':
      path = <><path d="M4.5 8.5A8 8 0 1 1 4 15" /><path d="M4.5 3.5v5h5" /><path d="M12 8v4l3 2" /></>
      break
    case 'cursor':
      path = <path d="M5 3 19 13l-7 1.5L9 21 5 3Z" />
      break
    case 'grid':
      path = <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 3v18M16 3v18M3 8h18M3 16h18" /></>
      break
    case 'chevron':
      path = <path d="m9 6 6 6-6 6" />
      break
  }

  return <svg {...common} {...props}>{path}</svg>
}
