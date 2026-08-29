import type React from 'react'
type IconName = 'search' | 'sun' | 'moon' | 'upload' | 'arrow' | 'code' | 'chevron' | 'spark' | 'close'
export function Icon({name, size=16}:{name:IconName;size?:number}) {
  const paths: Record<IconName, React.ReactNode> = {
    search:<><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>, sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></>, moon:<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>, upload:<><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M5 16v3h14v-3"/></>, arrow:<><path d="M5 19 19 5"/><path d="M9 5h10v10"/></>, code:<><path d="m8 8-4 4 4 4m8-8 4 4-4 4"/><path d="m14 5-4 14"/></>, chevron:<path d="m6 9 6 6 6-6"/>, spark:<><path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7Z"/></>, close:<path d="M6 6l12 12M18 6 6 18"/>
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
