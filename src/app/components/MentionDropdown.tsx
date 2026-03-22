'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { getImageUrl } from '@/lib/supabase/image'
import { searchFriendsForMention, type MentionSuggestion } from '@/app/actions/mentions'

function getMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos)
  const match = before.match(/@([a-zA-Z0-9_]*)$/)
  if (!match) return null
  const atIndex = before.length - match[0].length
  if (atIndex > 0 && !/\s/.test(before[atIndex - 1])) return null
  return match[1]
}

export function useMention(
  text: string,
  cursorPos: number,
  onSelect: (newText: string, newCursorPos: number) => void
) {
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const generationRef = useRef(0)
  const prevQueryRef = useRef<string | null>(null)

  const query = getMentionQuery(text, cursorPos)

  useEffect(() => {
    // Only react when the derived query actually changes
    if (query === prevQueryRef.current) return
    prevQueryRef.current = query

    const gen = ++generationRef.current

    if (query === null) {
      setVisible(false)
      setSuggestions([])
      return
    }

    setActiveIndex(0)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const results = await searchFriendsForMention(query)
      // Only apply if this is still the latest query
      if (gen !== generationRef.current) return
      setSuggestions(results)
      setVisible(results.length > 0)
    }, 200)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  const selectSuggestion = useCallback((username: string) => {
    const before = text.slice(0, cursorPos)
    const match = before.match(/@([a-zA-Z0-9_]*)$/)
    if (!match) return

    const start = before.length - match[0].length
    const newText = text.slice(0, start) + `@${username} ` + text.slice(cursorPos)
    const newPos = start + username.length + 2
    onSelect(newText, newPos)
    setVisible(false)
  }, [text, cursorPos, onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!visible || suggestions.length === 0) return false

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
      return true
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
      return true
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      selectSuggestion(suggestions[activeIndex].username)
      return true
    } else if (e.key === 'Escape') {
      setVisible(false)
      return true
    }
    return false
  }, [visible, suggestions, activeIndex, selectSuggestion])

  return { visible, suggestions, activeIndex, handleKeyDown, selectSuggestion }
}

interface DropdownProps {
  suggestions: MentionSuggestion[]
  activeIndex: number
  onSelect: (username: string) => void
  inline?: boolean
}

export default function MentionDropdown({ suggestions, activeIndex, onSelect, inline }: DropdownProps) {
  if (suggestions.length === 0) return null

  return (
    <div className={`${inline ? '' : 'absolute left-0 right-0 top-full mt-1'} bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden`}>
      {suggestions.map((s, i) => {
        const photo = s.profile_photo_url
          ? getImageUrl('avatars', s.profile_photo_url)
          : null
        return (
          <button
            key={s.username}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(s.username)
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              i === activeIndex ? 'bg-zinc-700' : 'hover:bg-zinc-700/50'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-zinc-600 overflow-hidden flex-shrink-0">
              {photo ? (
                <Image src={photo} alt="" width={28} height={28} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                  {(s.username?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-white text-sm font-medium">@{s.username}</span>
          </button>
        )
      })}
    </div>
  )
}
