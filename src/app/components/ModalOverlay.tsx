'use client'

interface Props {
  children: React.ReactNode
}

export default function ModalOverlay({ children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Scrollable content area */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="min-h-full bg-zinc-950 sm:mx-auto sm:max-w-2xl">
          {children}
        </div>
      </div>
    </div>
  )
}
