import { describe, it, expect } from 'vitest'
import { parseCoordinate, mapsUrl } from '@/lib/geo'

describe('parseCoordinate', () => {
  it('coordinate nude con virgola', () => {
    expect(parseCoordinate('41.9028, 12.4964')).toEqual({ lat: 41.9028, lng: 12.4964 })
  })

  it('coordinate nude con solo spazio', () => {
    expect(parseCoordinate('41.9028 12.4964')).toEqual({ lat: 41.9028, lng: 12.4964 })
  })

  it('coordinate negative', () => {
    expect(parseCoordinate('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 })
  })

  it('URL Maps con @lat,lng', () => {
    expect(parseCoordinate('https://www.google.com/maps/@41.9028,12.4964,15z')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL Maps con ?q=lat,lng', () => {
    expect(parseCoordinate('https://maps.google.com/?q=41.9028,12.4964')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL Maps con &query=lat,lng', () => {
    expect(parseCoordinate('https://www.google.com/maps/search/?api=1&query=41.9028,12.4964')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL Maps con !3dLAT!4dLNG', () => {
    expect(parseCoordinate('https://www.google.com/maps/place/X/data=!3d41.9028!4d12.4964')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL con sia @center che !3d!4d pin → usa il pin', () => {
    expect(parseCoordinate('https://www.google.com/maps/place/X/@41.9028,12.4964,17z/data=!3d41.8999!4d12.4888')).toEqual({
      lat: 41.8999, lng: 12.4888,
    })
  })

  it('link accorciato non risolvibile → null', () => {
    expect(parseCoordinate('https://maps.app.goo.gl/abc123')).toBeNull()
  })

  it('coordinate fuori range → null', () => {
    expect(parseCoordinate('120, 200')).toBeNull()
  })

  it('stringa vuota → null', () => {
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
  })

  it('spazzatura → null', () => {
    expect(parseCoordinate('via roma 10')).toBeNull()
  })
})

describe('mapsUrl', () => {
  it('costruisce URL universale', () => {
    expect(mapsUrl(41.9028, 12.4964)).toBe(
      'https://www.google.com/maps/search/?api=1&query=41.9028,12.4964',
    )
  })
})
