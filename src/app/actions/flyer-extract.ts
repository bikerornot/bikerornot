'use server'

import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface ExtractedFlyerData {
  title: string | null
  type: 'ride' | 'event' | null
  category: string | null
  description: string | null
  startsAt: string | null  // ISO datetime string
  endsAt: string | null
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  endAddress: string | null
  endCity: string | null
  endState: string | null
  endZipCode: string | null
}

export async function extractFlyerData(imageBase64: string): Promise<ExtractedFlyerData> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert at reading motorcycle event and ride flyers. Extract event details from the flyer image and return valid JSON only. No markdown, no code fences, just the JSON object.

Use these exact fields:
- title: the name of the event/ride
- type: "ride" if it's a group ride with start/end locations, "event" if it's a stationary event (rally, bike night, show, meetup)
- category: one of: group_ride, charity, poker_run, scenic_tour, rally, meetup, bike_night, show, swap_meet, other
- description: a short summary including any notable details (cost, what to bring, organizer, etc.)
- startsAt: date and time in ISO 8601 format (e.g. "2026-04-11T11:00:00"). Use the meet-up time if there are multiple times. If no year, assume 2026.
- endsAt: end time if mentioned, ISO 8601 format, or null
- venueName: name of the venue or meeting spot
- address: street address if visible
- city: city name
- state: full state name converted to 2-letter abbreviation (e.g. Tennessee → TN)
- zipCode: zip code if visible, or null
- endAddress: end/destination address for rides, or null
- endCity: end city for rides, or null
- endState: end state 2-letter abbreviation for rides, or null
- endZipCode: end zip code for rides, or null

If a field is not visible or mentioned, use null.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
          },
          {
            type: 'text',
            text: 'Extract all event/ride details from this flyer.'
          }
        ]
      }
    ],
    max_tokens: 1000,
  })

  const text = response.choices[0]?.message?.content?.trim() ?? '{}'

  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    return JSON.parse(cleaned) as ExtractedFlyerData
  } catch {
    console.error('Failed to parse flyer extraction:', text)
    return {
      title: null, type: null, category: null, description: null,
      startsAt: null, endsAt: null, venueName: null, address: null,
      city: null, state: null, zipCode: null,
      endAddress: null, endCity: null, endState: null, endZipCode: null,
    }
  }
}
