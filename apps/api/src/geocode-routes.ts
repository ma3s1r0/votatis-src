import { Hono } from "hono";
import { reverseRegion, type RegionPolygon } from "./geocode/reverse.js";

// 0021 역지오코딩 라우트. 좌표만 받고 시군구만 돌려준다(원본 GPS는 저장하지 않음 — 프라이버시).
// 경계 데이터셋은 주입(앱 기동 시 번들 GeoJSON 로드, 없으면 [] → 항상 null).
export function createGeocodeApp(dataset: RegionPolygon[]) {
  const app = new Hono();

  app.post("/reverse", async (c) => {
    let body: { lat?: number; lng?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const { lat, lng } = body;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return c.json({ error: "invalid_coordinates" }, 400);
    }
    const region = reverseRegion(lat, lng, dataset);
    return c.json({ region }); // 미매칭(바다/국외/데이터없음)이면 region=null
  });

  return app;
}
