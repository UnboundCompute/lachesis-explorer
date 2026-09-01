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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#07100d' },
    { media: '(prefers-color-scheme: light)', color: '#f1f4f1' },
  ],
  userScalable: true,
}

const themeInitializer = `(() => { try { if (localStorage.getItem('lachesis-theme') === 'light') document.documentElement.dataset.theme = 'light' } catch (_) {} })()`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInitializer }} /></head><body suppressHydrationWarning>{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
