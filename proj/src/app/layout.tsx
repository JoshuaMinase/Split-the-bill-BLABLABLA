import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SplitReceipt',
  description: 'Split restaurant bills with friends — scan, claim, pay.',
  icons: { icon: '/favicon.ico' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SplitReceipt',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 overflow-x-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-soft"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-3 px-5 h-14">
            {/* Logo */}
            <div className="w-8 h-8 rounded-xl bg-sky-500 flex items-center justify-center shadow-glow-sm flex-shrink-0">
              <span className="text-base leading-none">🧾</span>
            </div>

            {/* Wordmark */}
            <div className="flex-1">
              <span className="font-extrabold text-slate-800 text-base tracking-tight">
                Split<span className="text-sky-500">Receipt</span>
              </span>
            </div>

            {/* Live dot — purely decorative */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              live
            </div>
          </div>
        </header>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <main className="flex flex-col items-center px-4 py-6 pb-safe">
          <div className="w-full max-w-lg page-enter">
            {children}
          </div>
        </main>

      </body>
    </html>
  );
}
