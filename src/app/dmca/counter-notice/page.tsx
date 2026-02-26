import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import CounterNoticeForm from './CounterNoticeForm'

export const metadata = {
  title: 'DMCA Counter-Notice — BikerOrNot',
}

export default async function CounterNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; post_id?: string }>
}) {
  const { url, post_id } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let prefillName = ''
  let prefillEmail = ''
  let prefillUrl = url ?? ''
  let removedPost: {
    id: string
    content: string | null
    created_at: string
    imageUrl: string | null
  } | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()
    if (profile) {
      prefillName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
    }
    prefillEmail = user.email ?? ''

    // Fetch the removed post (bypasses deleted_at filter using service client)
    // Only shown to the post owner
    if (post_id) {
      const admin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: post } = await admin
        .from('posts')
        .select('id, author_id, content, created_at, images:post_images(storage_path, order_index)')
        .eq('id', post_id)
        .single()

      // Only show the post preview to its actual author
      if (post && post.author_id === user.id) {
        const firstImage = (post.images as any[])
          ?.sort((a: any, b: any) => a.order_index - b.order_index)[0]
        const imageUrl = firstImage
          ? getImageUrl('posts', firstImage.storage_path)
          : null

        removedPost = {
          id: post.id,
          content: post.content,
          created_at: post.created_at,
          imageUrl,
        }

        // Auto-fill the URL with the post page URL
        if (!prefillUrl) {
          prefillUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') ?? ''}/posts/${post.id}`
            .replace(/https?:\/\/[^/]+/, `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bikerornot.com'}`)
          prefillUrl = `https://bikerornot.com/posts/${post.id}`
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Biker<span className="text-orange-500">Or</span>Not
          </Link>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/dmca" className="hover:text-white transition-colors">DMCA Policy</Link>
            {user ? (
              <Link href="/feed" className="hover:text-white transition-colors">Back to feed</Link>
            ) : (
              <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Page header */}
        <div className="mb-8">
          <Link
            href="/dmca"
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            DMCA Policy
          </Link>
          <h1 className="text-3xl font-black text-white mb-2">DMCA Counter-Notice</h1>
          <p className="text-zinc-400 leading-relaxed">
            Use this form if you believe your content was removed in error. This is a legal
            document submitted under penalty of perjury — please read all statements carefully.
          </p>
        </div>

        {/* Removed post preview */}
        {removedPost && (
          <div className="mb-8 bg-zinc-900 border border-amber-500/30 rounded-2xl p-5">
            <p className="text-amber-400 text-xs font-semibold uppercase tracking-wide mb-3">
              Removed post — this is what was taken down
            </p>
            <div className="flex gap-4">
              {removedPost.imageUrl && (
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                  <Image
                    src={removedPost.imageUrl}
                    alt="Removed post image"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {removedPost.content && (
                  <p className="text-zinc-200 text-sm leading-relaxed line-clamp-3">
                    {removedPost.content}
                  </p>
                )}
                {!removedPost.content && removedPost.imageUrl && (
                  <p className="text-zinc-400 text-sm italic">Photo post</p>
                )}
                <p className="text-zinc-500 text-xs mt-2">
                  Posted {new Date(removedPost.created_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        <CounterNoticeForm
          prefillName={prefillName}
          prefillEmail={prefillEmail}
          prefillUrl={prefillUrl}
          postId={post_id}
        />
      </main>
    </div>
  )
}
