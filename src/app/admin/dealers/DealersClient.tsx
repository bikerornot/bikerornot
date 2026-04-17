'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listDealers, type HdDealer } from '@/app/actions/hd-dealers'

interface Props {
  initialRows: HdDealer[]
  initialTotal: number
  initialContactCounts: Record<string, number>
  states: string[]
  pageSize: number
  initialPage: number
  initialFilters: { search: string; state: string; country: string }
}

const inputClass =
  'bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors'

export default function DealersClient({
  initialRows,
  initialTotal,
  initialContactCounts,
  states,
  pageSize,
  initialPage,
  initialFilters,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<HdDealer[]>(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>(initialContactCounts)
  const [page, setPage] = useState(initialPage)
  const [search, setSearch] = useState(initialFilters.search)
  const [state, setState] = useState(initialFilters.state)
  const [country, setCountry] = useState(initialFilters.country)
  const [isPending, startTransition] = useTransition()

  async function refresh(nextPage: number, opts?: { search?: string; state?: string; country?: string }) {
    const s = opts?.search ?? search
    const st = opts?.state ?? state
    const c = opts?.country ?? country
    startTransition(async () => {
      const res = await listDealers({
        search: s,
        state: st || null,
        country: c || null,
        limit: pageSize,
        offset: (nextPage - 1) * pageSize,
      })
      setRows(res.rows)
      setTotal(res.total)
      setContactCounts(res.contactCounts)
      setPage(nextPage)

      const params = new URLSearchParams()
      if (s) params.set('q', s)
      if (st) params.set('state', st)
      if (c && c !== 'USA') params.set('country', c)
      if (nextPage > 1) params.set('page', String(nextPage))
      const qs = params.toString()
      router.replace(qs ? `/admin/dealers?${qs}` : '/admin/dealers', { scroll: false })
    })
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    refresh(1)
  }

  const totalPages = Math.max(Math.ceil(total / pageSize), 1)

  return (
    <div>
      {/* Filters */}
      <form onSubmit={onSearchSubmit} className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-zinc-500 mb-1">Search</label>
          <input
            className={`${inputClass} w-full`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, city, dealer ID, zip"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">State</label>
          <select
            className={`${inputClass} w-28`}
            value={state}
            onChange={(e) => { setState(e.target.value); refresh(1, { state: e.target.value }) }}
          >
            <option value="">All</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Country</label>
          <select
            className={`${inputClass} w-28`}
            value={country}
            onChange={(e) => { setCountry(e.target.value); refresh(1, { country: e.target.value }) }}
          >
            <option value="USA">USA</option>
            <option value="">All</option>
            <option value="CAN">Canada</option>
            <option value="JPN">Japan</option>
            <option value="DEU">Germany</option>
            <option value="FRA">France</option>
            <option value="ITA">Italy</option>
            <option value="AUS">Australia</option>
            <option value="GBR">UK</option>
            <option value="MEX">Mexico</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:bg-zinc-700"
        >
          Search
        </button>
        <div className="ml-auto">
          <Link
            href="/admin/dealers/new"
            className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-zinc-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Dealer
          </Link>
        </div>
      </form>

      {/* Table */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">City, State</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Website</th>
              <th className="text-left px-4 py-3">Contacts</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No dealers match your filters.
                </td>
              </tr>
            )}
            {rows.map((d) => (
              <tr
                key={d.id}
                className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                onClick={() => router.push(`/admin/dealers/${d.id}`)}
              >
                <td className="px-4 py-3 text-zinc-500 font-mono">{d.hd_dealer_id}</td>
                <td className="px-4 py-3 text-white font-medium">{d.name}</td>
                <td className="px-4 py-3 text-zinc-300">
                  {[d.city, d.state].filter(Boolean).join(', ') || '—'}
                  {d.country && d.country !== 'USA' && (
                    <span className="ml-1.5 text-zinc-500 text-xs">({d.country})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400">{d.phone || '—'}</td>
                <td className="px-4 py-3 text-zinc-400 max-w-[200px] truncate">
                  {d.website ? (
                    <a
                      href={d.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-zinc-400">{contactCounts[d.id] ?? 0}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      d.is_active
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-zinc-700 text-zinc-400'
                    }`}
                  >
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-zinc-500">
            Page {page} of {totalPages} · {total} results
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1 || isPending}
              onClick={() => refresh(page - 1)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-40 disabled:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages || isPending}
              onClick={() => refresh(page + 1)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-40 disabled:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
