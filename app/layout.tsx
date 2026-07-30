import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Funcional UP Digital',
  description: 'Treinamento funcional personalizado com acompanhamento humano.',
  icons: {
    icon: [
      { url: '/branding/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/branding/favicon-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: [{ url: '/branding/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Funcional UP Digital',
    description: 'Treinamento funcional personalizado com acompanhamento humano.',
    images: ['/branding/logo-1024.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
