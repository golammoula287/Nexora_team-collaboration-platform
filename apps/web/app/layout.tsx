import type { Metadata, Viewport } from 'next';
import { Providers } from '../providers';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Nexora', template: '%s · Nexora' },
  description: 'AI-native team collaboration: projects, tasks, docs and comms in one workspace.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0f13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the class on <html> before
    // React hydrates, which is the point - it prevents a flash of light theme.
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only-focusable bg-accent text-accent-fg fixed top-4 left-4 z-50 rounded-sm px-3 py-2 text-[13px] font-medium"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
