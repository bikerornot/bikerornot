export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-white">Biker</span><span className="text-orange-500">Or</span><span className="text-white">Not</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Where the ride never ends.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
