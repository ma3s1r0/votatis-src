// 17개 시도 중심 좌표 정적 상수(스펙 0018 결정 1).
// 실 지도 타일/지오코딩 비목표 — 분포 표시에 충분한 수준의 SVG viewBox(0..100) 좌표.
// x: 왼쪽(0)→오른쪽(100, 동), y: 위(0, 북)→아래(100, 남). 대략적 배치.
// 시도명은 아카이브 sido 필터 옵션(ArchiveListPage SIDO_OPTIONS) 및 서버 sido 값과 동일 출처.

export type SidoCoord = { x: number; y: number };

export const SIDO_COORDS: Record<string, SidoCoord> = {
  서울특별시: { x: 41, y: 24 },
  인천광역시: { x: 33, y: 26 },
  경기도: { x: 44, y: 28 },
  강원특별자치도: { x: 64, y: 22 },
  충청북도: { x: 53, y: 40 },
  충청남도: { x: 36, y: 43 },
  세종특별자치시: { x: 44, y: 42 },
  대전광역시: { x: 47, y: 47 },
  전북특별자치도: { x: 40, y: 58 },
  전라남도: { x: 36, y: 72 },
  광주광역시: { x: 33, y: 68 },
  경상북도: { x: 67, y: 47 },
  대구광역시: { x: 63, y: 55 },
  경상남도: { x: 58, y: 67 },
  부산광역시: { x: 70, y: 70 },
  울산광역시: { x: 73, y: 60 },
  제주특별자치도: { x: 30, y: 92 },
};

// 좌표가 없는(상수 미등록) 또는 null sido 는 null 을 반환한다 — 호출부에서 "미지정" 버킷으로 폴백.
export function sidoCoord(sido: string | null): SidoCoord | null {
  if (!sido) return null;
  return SIDO_COORDS[sido] ?? null;
}

// 외부 지도(Leaflet/OSM)용 실제 위경도(시도 대표 좌표).
export type LatLng = { lat: number; lng: number };

export const SIDO_LATLNG: Record<string, LatLng> = {
  서울특별시: { lat: 37.5665, lng: 126.978 },
  인천광역시: { lat: 37.4563, lng: 126.7052 },
  경기도: { lat: 37.4138, lng: 127.5183 },
  강원특별자치도: { lat: 37.8228, lng: 128.1555 },
  충청북도: { lat: 36.8, lng: 127.7 },
  충청남도: { lat: 36.5184, lng: 126.8 },
  세종특별자치시: { lat: 36.48, lng: 127.289 },
  대전광역시: { lat: 36.3504, lng: 127.3845 },
  전북특별자치도: { lat: 35.7175, lng: 127.153 },
  전라남도: { lat: 34.8679, lng: 126.991 },
  광주광역시: { lat: 35.1595, lng: 126.8526 },
  경상북도: { lat: 36.4919, lng: 128.8889 },
  대구광역시: { lat: 35.8714, lng: 128.6014 },
  경상남도: { lat: 35.4606, lng: 128.2132 },
  부산광역시: { lat: 35.1796, lng: 129.0756 },
  울산광역시: { lat: 35.5384, lng: 129.3114 },
  제주특별자치도: { lat: 33.4996, lng: 126.5312 },
};

export function sidoLatLng(sido: string | null): LatLng | null {
  if (!sido) return null;
  return SIDO_LATLNG[sido] ?? null;
}
