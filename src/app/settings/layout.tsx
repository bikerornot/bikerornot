import Link from 'next/link'
import Logo from '@/app/components/Logo'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
            ← Back
          </Link>
        </div>
      </header>
      {children}
    </>
  )
}
