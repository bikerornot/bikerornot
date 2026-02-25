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

const MAKES_BY_COUNTRY: Record<string, string[]> = {
  'American':  ['Buell', 'Harley-Davidson', 'Indian', 'Victory', 'Zero'],
  'British':   ['BSA', 'Norton', 'Triumph'],
  'German':    ['BMW'],
  'Italian':   ['Aprilia', 'Ducati', 'Moto Guzzi'],
  'Japanese':  ['Honda', 'Kawasaki', 'Suzuki', 'Yamaha'],
}

const selectClass =
  'w-full bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm disabled:opacity-50'
const inputClass =
  'w-full bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm disabled:opacity-50'

const ALL_MAKES = Object.values(MAKES_BY_COUNTRY).flat()

export default function BikeSelector({ value, onChange }: Props) {
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const isOtherMake = !!value.make && !ALL_MAKES.includes(value.make)

  // Fetch models whenever year + make change (skip for "Other")
  useEffect(() => {
    if (!value.year || !value.make || isOtherMake) {
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
  }, [value.year, value.make, isOtherMake])

  function setYear(year: string) {
    onChange({ year, make: value.make, model: '' })
  }

  function handleMakeSelect(selected: string) {
    if (selected === '__other__') {
      onChange({ year: value.year, make: '', model: '' })
    } else {
      onChange({ year: value.year, make: selected, model: '' })
    }
  }

  function setModel(model: string) {
    onChange({ ...value, model })
  }

  // The select value when "Other" is active
  const makeSelectValue = isOtherMake ? '__other__' : value.make

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* Year */}
        <select value={value.year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
          <option value="">Year</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>

        {/* Make */}
        <select
          value={makeSelectValue}
          onChange={(e) => handleMakeSelect(e.target.value)}
          className={selectClass}
        >
          <option value="">Make</option>
          {Object.entries(MAKES_BY_COUNTRY).map(([country, makes]) => (
            <optgroup key={country} label={country}>
              {makes.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </optgroup>
          ))}
          <optgroup label="──────────">
            <option value="__other__">Other…</option>
          </optgroup>
        </select>
      </div>

      {/* Other make text input */}
      {isOtherMake || makeSelectValue === '__other__' ? (
        <input
          type="text"
          value={isOtherMake ? value.make : ''}
          onChange={(e) => onChange({ year: value.year, make: e.target.value, model: '' })}
          placeholder="Enter make"
          autoFocus
          className={inputClass}
        />
      ) : null}

      {/* Model */}
      {models.length > 0 ? (
        <select
          value={value.model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loadingModels}
          className={selectClass}
        >
          <option value="">Model</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value.model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={loadingModels ? 'Loading models…' : 'Model'}
          disabled={loadingModels}
          className={inputClass}
        />
      )}
    </div>
  )
}
