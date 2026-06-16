// 0021 역지오코딩 엔진(오프라인): 좌표(lat,lng) → 시도/시군구.
// 순수 point-in-polygon(ray casting). 경계 데이터셋은 주입(번들 GeoJSON 로더 분리).
// 무거운 데이터(전국 시군구 경계)는 API 측에만 둔다(웹 번들 비대화 방지).

// GeoJSON 좌표 규약: [lng, lat]. polygons = Polygon[] (MultiPolygon),
// Polygon = Ring[] (0번 외곽, 이후 구멍). ring = [lng,lat][].
export type RegionPolygon = {
  sido: string;
  sigungu: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  polygons: number[][][][];
};

export type Region = { sido: string; sigungu: string };

// ring 내부 판정(ray casting). x=lng, y=lat.
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 외곽 ring 안 + 구멍(holes) 밖이면 내부.
function pointInPolygon(x: number, y: number, polygon: number[][][]): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(x, y, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(x, y, polygon[h])) return false; // 구멍 안 → 제외
  }
  return true;
}

export function reverseRegion(
  lat: number,
  lng: number,
  dataset: RegionPolygon[],
): Region | null {
  for (const r of dataset) {
    const [minLng, minLat, maxLng, maxLat] = r.bbox;
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    for (const poly of r.polygons) {
      if (pointInPolygon(lng, lat, poly)) {
        return { sido: r.sido, sigungu: r.sigungu };
      }
    }
  }
  return null;
}
