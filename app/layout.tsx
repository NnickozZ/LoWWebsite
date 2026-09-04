import type { Metadata, Viewport } from 'next';
import { ErrorReporter } from '@/components/ErrorReporter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zeeland Case Files',
  description: 'Archief van de campagne',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EEE2' },
    { media: '(prefers-color-scheme: dark)', color: '#1B1915' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        {/*
          Mounted at the root, above the login boundary, because a browser
          exception on the sign-in page is as worth having as one inside the
          archive. It renders nothing.
        */}
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
