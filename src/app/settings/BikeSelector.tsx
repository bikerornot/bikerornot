'use client'

import { useState, useEffect } from 'react'

export interface BikeData {
  year: string
  make: string
  model: string
}

interface Props {
  value: BikeData
  onChange: (value: BikeData) => void
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1979 }, (_, i) => CURRENT_YEAR - i)

const selectClass =
  'w-full bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm disabled:opacity-50'
const inputClass =
  'w-full bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm disabled:opacity-50'

// Shared cache so makes are only fetched once per page load
let makesCache: string[] | null = null
let makesFetch: Promise<string[]> | null = null

async function fetchMakes(): Promise<string[]> {
  if (makesCache) return makesCache
  if (!makesFetch) {
    makesFetch = fetch(
      'https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/Motorcycle?format=json'
    )
      .then((r) => r.json())
      .then((data) => {
        const names: string[] = data.Results.map((r: { MakeName: string }) => r.MakeName).sort()
        makesCache = names
        return names
      })
  }
  return makesFetch
}

export default function BikeSelector({ value, onChange }: Props) {
  const [makes, setMakes] = useState<string[]>(makesCache ?? [])
  const [models, setModels] = useState<string[]>([])
  const [loadingMakes, setLoadingMakes] = useState(!makesCache)
  const [loadingModels, setLoadingModels] = useState(false)

  // Fetch motorcycle makes once
  useEffect(() => {
    if (makesCache) {
      setMakes(makesCache)
      return
    }
    setLoadingMakes(true)
    fetchMakes()
      .then(setMakes)
      .catch(() => {})
      .finally(() => setLoadingMakes(false))
  }, [])

  // Fetch models whenever year + make change
  useEffect(() => {
    if (!value.year || !value.make) {
      setModels([])
      return
    }
    setLoadingModels(true)
    const make = encodeURIComponent(value.make)
    fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${make}/modelyear/${value.year}/vehicleType/Motorcycle?format=json`
    )
      .then((r) => r.json())
      .then((data) => {
        const names: string[] = data.Results.map((r: { Model_Name: string }) => r.Model_Name).sort()
        setModels(names)
      })
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false))
  }, [value.year, value.make])

  function setYear(year: string) {
    onChange({ year, make: value.make, model: '' })
  }

  function setMake(make: string) {
    onChange({ year: value.year, make, model: '' })
  }

  function setModel(model: string) {
    onChange({ ...value, model })
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Year */}
      <select value={value.year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
        <option value="">Year</option>
        {YEARS.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>

      {/* Make */}
      <select
        value={value.make}
        onChange={(e) => setMake(e.target.value)}
        disabled={loadingMakes}
        className={selectClass}
      >
        <option value="">{loadingMakes ? 'Loading…' : 'Make'}</option>
        {makes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {/* Model — dropdown if NHTSA has data, text input fallback for older bikes */}
      {models.length > 0 ? (
        <select
          value={value.model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loadingModels}
          className={selectClass}
        >
          <option value="">Model</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value.model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={loadingModels ? 'Loading…' : 'Model'}
          disabled={loadingModels}
          className={inputClass}
        />
      )}
    </div>
  )
}
