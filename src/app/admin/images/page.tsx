import { getPostImages, getAvatarImages } from '@/app/actions/images'
import ImagesClient from './ImagesClient'

export const metadata = { title: 'Images — BikerOrNot Admin' }

export default async function AdminImagesPage() {
  const [
    { images: postImages, hasMore: hasMorePosts },
    { images: avatars, hasMore: hasMoreAvatars },
  ] = await Promise.all([getPostImages(1), getAvatarImages(1)])

  const totalLoaded = postImages.length + avatars.length

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Images</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Browse and remove user-uploaded images
        </p>
      </div>

      <ImagesClient
        initialPostImages={postImages}
        initialAvatars={avatars}
        hasMorePosts={hasMorePosts}
        hasMoreAvatars={hasMoreAvatars}
      />
    </div>
  )
}
