import { BetaAnalyticsDataClient } from '@google-analytics/data'
import path from 'path'

const propertyId = process.env.GA_PROPERTY_ID
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON

let client: BetaAnalyticsDataClient | null = null

function getClient() {
  if (!client) {
    if (credentialsJson) {
      // Vercel: credentials as JSON string in env var
      const credentials = JSON.parse(credentialsJson)
      client = new BetaAnalyticsDataClient({ credentials })
    } else {
      // Local: credentials file
      const keyFile = credentialsPath?.startsWith('/')
        ? credentialsPath
        : path.resolve(process.cwd(), credentialsPath ?? './ga-credentials.json')
      client = new BetaAnalyticsDataClient({ keyFilename: keyFile })
    }
  }
  return client
}

export interface GAMetrics {
  visitors: number
  sessions: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
}

export async function getGAMetrics(startDate: string, endDate: string): Promise<GAMetrics> {
  if (!propertyId) throw new Error('GA_PROPERTY_ID not set')

  const analyticsClient = getClient()
  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
  })

  const row = response.rows?.[0]
  return {
    visitors: Number(row?.metricValues?.[0]?.value ?? 0),
    sessions: Number(row?.metricValues?.[1]?.value ?? 0),
    pageviews: Number(row?.metricValues?.[2]?.value ?? 0),
    bounceRate: Number(row?.metricValues?.[3]?.value ?? 0),
    avgSessionDuration: Number(row?.metricValues?.[4]?.value ?? 0),
  }
}

export interface GATrafficSource {
  source: string
  medium: string
  sessions: number
  users: number
}

export async function getGATrafficSources(startDate: string, endDate: string): Promise<GATrafficSource[]> {
  if (!propertyId) throw new Error('GA_PROPERTY_ID not set')

  const analyticsClient = getClient()
  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 20,
  })

  return (response.rows ?? []).map((row) => ({
    source: row.dimensionValues?.[0]?.value ?? '(unknown)',
    medium: row.dimensionValues?.[1]?.value ?? '(unknown)',
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    users: Number(row.metricValues?.[1]?.value ?? 0),
  }))
}

export interface GATopPage {
  path: string
  pageviews: number
  users: number
}

export async function getGATopPages(startDate: string, endDate: string, limit = 10): Promise<GATopPage[]> {
  if (!propertyId) throw new Error('GA_PROPERTY_ID not set')

  const analyticsClient = getClient()
  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'totalUsers' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  })

  return (response.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? '/',
    pageviews: Number(row.metricValues?.[0]?.value ?? 0),
    users: Number(row.metricValues?.[1]?.value ?? 0),
  }))
}

export interface GADeviceBreakdown {
  device: string
  sessions: number
  users: number
  percentage: number
}

export async function getGADeviceBreakdown(startDate: string, endDate: string): Promise<GADeviceBreakdown[]> {
  if (!propertyId) throw new Error('GA_PROPERTY_ID not set')

  const analyticsClient = getClient()
  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  })

  const rows = (response.rows ?? []).map((row) => ({
    device: row.dimensionValues?.[0]?.value ?? 'unknown',
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    users: Number(row.metricValues?.[1]?.value ?? 0),
    percentage: 0,
  }))

  const totalSessions = rows.reduce((sum, r) => sum + r.sessions, 0)
  for (const r of rows) {
    r.percentage = totalSessions > 0 ? r.sessions / totalSessions : 0
  }
  return rows
}

export interface GAPageBounce {
  path: string
  sessions: number
  bounceRate: number
}

export async function getGABounceByPage(startDate: string, endDate: string, limit = 10): Promise<GAPageBounce[]> {
  if (!propertyId) throw new Error('GA_PROPERTY_ID not set')

  const analyticsClient = getClient()
  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'sessions' },
      { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  })

  return (response.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? '/',
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    bounceRate: Number(row.metricValues?.[1]?.value ?? 0),
  }))
}

export interface GADailyMetric {
  date: string
  value: number
}

export async function getGADailySessions(startDate: string, endDate: string): Promise<GADailyMetric[]> {
  if (!propertyId) throw new Error('GA_PROPERTY_ID not set')

  const analyticsClient = getClient()
  const [response] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  })

  return (response.rows ?? []).map((row) => {
    const raw = row.dimensionValues?.[0]?.value ?? ''
    const date = raw.length === 8
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      : raw
    return { date, value: Number(row.metricValues?.[0]?.value ?? 0) }
  })
}
