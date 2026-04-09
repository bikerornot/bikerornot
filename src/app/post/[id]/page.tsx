import { redirect } from 'next/navigation'

// Legacy route — older comment-notification emails link here as /post/{id}.
// Canonical route is /posts/{id}. Keep this as a permanent redirect so old
// links keep working.
export default async function LegacyPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/posts/${id}`)
}
