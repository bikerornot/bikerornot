import Link from 'next/link'
import DmcaForm from './DmcaForm'

export const metadata = {
  title: 'File a Copyright Infringement Notice — BikerOrNot',
}

export default function DmcaReportPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-black tracking-tight">
            Biker<span className="text-orange-500">Or</span>Not
          </Link>
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/dmca"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          DMCA Policy
        </Link>

        <h1 className="text-3xl font-black text-white mb-2">File a Copyright Infringement Notice</h1>
        <p className="text-zinc-400 text-sm mb-2">
          Use this form to report content on BikerOrNot that infringes your copyright.
          All fields marked <span className="text-orange-500">*</span> are required.
        </p>
        <p className="text-zinc-500 text-xs mb-10">
          Prefer email?{' '}
          <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">
            dmca@bikerornot.com
          </a>
          {' '}— include all elements listed in our{' '}
          <Link href="/dmca" className="text-orange-400 hover:text-orange-300">
            DMCA Policy
          </Link>.
        </p>

        <DmcaForm />
      </div>

      <footer className="border-t border-zinc-800 py-8 px-6 mt-16">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-600">
          <p>&copy; {new Date().getFullYear()} BikerOrNot.com. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <Link href="/dmca" className="hover:text-zinc-400 transition-colors">DMCA Policy</Link>
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
