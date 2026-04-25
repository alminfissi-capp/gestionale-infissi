function toRad(deg: number) { return (deg * Math.PI) / 180 }

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  let start = startDeg % 360
  let end = endDeg % 360
  if (end <= start) end += 360
  const large = end - start > 180 ? 1 : 0
  const x1 = cx + r * Math.cos(toRad(start))
  const y1 = cy + r * Math.sin(toRad(start))
  const x2 = cx + r * Math.cos(toRad(end))
  const y2 = cy + r * Math.sin(toRad(end))
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

function bulgeArcPath(x1: number, y1: number, x2: number, y2: number, bulge: number): string {
  const theta = 4 * Math.atan(Math.abs(bulge))
  const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  const r = d / (2 * Math.sin(theta / 2))
  const largeArc = theta > Math.PI ? 1 : 0
  const sweep = bulge > 0 ? 1 : 0
  return `A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`
}

export type DxfResult = { paths: string[]; viewBox: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entitiesToPaths(entities: any[]): { paths: string[]; bbox: { minX: number; minY: number; maxX: number; maxY: number } } {
  const paths: string[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  const expand = (x: number, y: number) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processEntity = (e: any) => {
    if (e.type === 'LINE') {
      const [v0, v1] = e.vertices
      if (!v0 || !v1) return
      paths.push(`M ${v0.x} ${v0.y} L ${v1.x} ${v1.y}`)
      expand(v0.x, v0.y); expand(v1.x, v1.y)
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verts: any[] = e.vertices ?? []
      if (verts.length < 2) return
      let d = `M ${verts[0].x} ${verts[0].y}`
      expand(verts[0].x, verts[0].y)
      for (let i = 0; i < verts.length - 1; i++) {
        const v = verts[i]
        const vn = verts[i + 1]
        expand(vn.x, vn.y)
        if (v.bulge && Math.abs(v.bulge) > 1e-6) {
          d += ` ${bulgeArcPath(v.x, v.y, vn.x, vn.y, v.bulge)}`
        } else {
          d += ` L ${vn.x} ${vn.y}`
        }
      }
      if (e.shape) {
        const last = verts[verts.length - 1]
        const first = verts[0]
        if (last.bulge && Math.abs(last.bulge) > 1e-6) {
          d += ` ${bulgeArcPath(last.x, last.y, first.x, first.y, last.bulge)}`
        } else {
          d += ' Z'
        }
      }
      paths.push(d)
    } else if (e.type === 'CIRCLE') {
      const { x, y } = e.center
      const r = e.radius
      paths.push(`M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y}`)
      expand(x - r, y - r); expand(x + r, y + r)
    } else if (e.type === 'ARC') {
      const { x, y } = e.center
      paths.push(arcPath(x, y, e.radius, e.startAngle, e.endAngle))
      expand(x - e.radius, y - e.radius); expand(x + e.radius, y + e.radius)
    } else if (e.type === 'SPLINE' && e.controlPoints) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pts: any[] = e.controlPoints
      if (pts.length < 2) return
      let d = `M ${pts[0].x} ${pts[0].y}`
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`
        expand(pts[i].x, pts[i].y)
      }
      expand(pts[0].x, pts[0].y)
      paths.push(d)
    } else if (e.type === 'INSERT' && e.entities) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e.entities.forEach((sub: any) => processEntity(sub))
    }
  }

  entities.forEach(processEntity)

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100 }

  return { paths, bbox: { minX, minY, maxX, maxY } }
}

export async function parseDxfUrl(url: string): Promise<DxfResult> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  const text = await res.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { default: DxfParser } = await import('dxf-parser') as any
  const parser = new DxfParser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxf = parser.parseSync(text) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEntities: any[] = dxf?.entities ?? []
  if (dxf?.blocks) {
    Object.values(dxf.blocks).forEach((block: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any
      if (Array.isArray(b.entities)) allEntities.push(...b.entities)
    })
  }

  const { paths, bbox } = entitiesToPaths(allEntities)
  const pad = Math.max((bbox.maxX - bbox.minX) * 0.05, 1)
  const viewBox = `${bbox.minX - pad} ${bbox.minY - pad} ${bbox.maxX - bbox.minX + pad * 2} ${bbox.maxY - bbox.minY + pad * 2}`
  return { paths, viewBox }
}
