import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BikerOrNot — The Motorcycle Enthusiast Network',
  description: 'Connect with fellow riders, share your rides, and find your community.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} antialiased bg-zinc-950 text-white`}>
        {children}
      </body>
    </html>
  )
}
