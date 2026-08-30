import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lachesis — Deterministic code graph reader',
  description: 'Follow values and requests through a deterministic code graph.',
  generator: 'Next.js',
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#07100d',
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" data-scroll-behavior="smooth"><body>{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
