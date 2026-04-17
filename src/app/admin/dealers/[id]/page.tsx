import { notFound } from 'next/navigation'
import { getDealerById } from '@/app/actions/hd-dealers'
import DealerDetailClient from './DealerDetailClient'

export const metadata = { title: 'Dealer – Admin' }

export default async function DealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getDealerById(id)
  if (!data) notFound()
  return (
    <DealerDetailClient
      initialDealer={data.dealer}
      initialContacts={data.contacts}
    />
  )
}
