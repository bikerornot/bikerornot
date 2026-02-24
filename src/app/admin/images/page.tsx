import { getPostImages, getAvatarImages } from '@/app/actions/images'
import ImagesClient from './ImagesClient'

export const metadata = { title: 'Images — BikerOrNot Admin' }

export default async function AdminImagesPage() {
  const [
    { images: postImages, hasMore: hasMorePosts, queueTotal: postQueueTotal },
    { images: avatars, hasMore: hasMoreAvatars, queueTotal: avatarQueueTotal },
  ] = await Promise.all([getPostImages(1), getAvatarImages(1)])

  const totalPending = postQueueTotal + avatarQueueTotal

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Images</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          {totalPending === 0
            ? 'All images reviewed — queue is empty'
            : `${totalPending} image${totalPending === 1 ? '' : 's'} awaiting review`}
        </p>
      </div>

      <ImagesClient
        initialPostImages={postImages}
        initialAvatars={avatars}
        hasMorePosts={hasMorePosts}
        hasMoreAvatars={hasMoreAvatars}
        postQueueTotal={postQueueTotal}
        avatarQueueTotal={avatarQueueTotal}
      />
    </div>
  )
}
