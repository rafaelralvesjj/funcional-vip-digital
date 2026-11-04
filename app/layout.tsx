import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Funcional UP Digital',
  description: 'Treinamento funcional personalizado com acompanhamento humano.',
  icons: {
    // O mesmo símbolo oficial exibido pelo componente BrandLogo.
    // A versão da URL força o navegador a buscar o novo favicon.
    icon: [
      { url: '/branding/icon-funcional-up.svg?v=20261104', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcut: '/branding/icon-funcional-up.svg?v=20261104',
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
