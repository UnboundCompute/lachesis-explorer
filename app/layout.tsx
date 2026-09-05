import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lachesis — Deterministic code graph reader',
  description: 'Follow values and requests through a deterministic code graph.',
  referrer: 'no-referrer',
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#07100d' },
    { media: '(prefers-color-scheme: light)', color: '#f1f4f1' },
  ],
  userScalable: true,
}

const themeInitializer = `(() => { try { if (localStorage.getItem('lachesis-theme') === 'light') document.documentElement.dataset.theme = 'light' } catch (_) {} })()`
const analyticsEnabled = process.env.NODE_ENV === 'production' && (process.env.VERCEL === '1' || process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true')

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInitializer }} /></head><body suppressHydrationWarning>{children}{analyticsEnabled && <Analytics />}</body></html>
}
