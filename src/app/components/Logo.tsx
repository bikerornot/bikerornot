import Link from 'next/link'

export default function Logo() {
  return (
    <Link href="/feed" className="text-xl font-bold tracking-tight">
      <span className="text-white">Biker</span>
      <span className="text-orange-500">Or</span>
      <span className="text-white">Not</span>
    </Link>
  )
}
