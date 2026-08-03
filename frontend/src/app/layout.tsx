import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SplitReceipt',
  description: 'Split restaurant bills with friends — scan, claim, pay.',
  icons: { icon: '/favicon.ico' },
  // Progressive Web App hints for "Add to home screen"
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
  // Extend layout under the status bar on iOS for the gradient header
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 overflow-x-hidden">
        {/* ── Gradient header ─────────────────────────────────────────────── */}
        <header
          className="relative z-20 flex items-center gap-3 px-5 py-4 shadow-md"
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 60%, #ec4899 100%)',
            paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
          }}
        >
          {/* Logo badge */}
          <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
            <span className="text-xl leading-none">🧾</span>
          </div>

          {/* Wordmark */}
          <div className="flex-1">
            <h1 className="font-extrabold text-white text-lg leading-tight tracking-tight">
              SplitReceipt
            </h1>
            <p className="text-white/70 text-[10px] font-medium tracking-wide uppercase leading-none mt-0.5">
              Split bills. No awkwardness.
            </p>
          </div>

          {/* Step indicator pill — decorative, shows app has steps */}
          <div className="flex items-center gap-1 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="w-1.5 h-1.5 rounded-full bg-white/70"
              />
            ))}
          </div>
        </header>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <main className="flex flex-col items-center px-4 py-6 pb-safe">
          <div className="w-full max-w-lg page-enter">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
