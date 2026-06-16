import { describe, it, expect } from "vitest";
import { createGeocodeApp } from "./geocode-routes.js";
import type { RegionPolygon } from "./geocode/reverse.js";

const dataset: RegionPolygon[] = [
  {
    sido: "서울특별시",
    sigungu: "테스트구",
    bbox: [126, 37, 128, 38],
    polygons: [[[[126, 37], [128, 37], [128, 38], [126, 38], [126, 37]]]],
  },
];

function post(app: ReturnType<typeof createGeocodeApp>, body: unknown) {
  return app.request("/reverse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /reverse (0021)", () => {
  it("폴리곤 내부 좌표 → region 반환", async () => {
    const app = createGeocodeApp(dataset);
    const res = await post(app, { lat: 37.5, lng: 127 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      region: { sido: "서울특별시", sigungu: "테스트구" },
    });
  });

  it("미매칭 좌표 → region null", async () => {
    const app = createGeocodeApp(dataset);
    const res = await post(app, { lat: 33, lng: 100 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ region: null });
  });

  it("범위 밖 좌표 → 400", async () => {
    const app = createGeocodeApp(dataset);
    expect((await post(app, { lat: 999, lng: 127 })).status).toBe(400);
    expect((await post(app, { lat: 37, lng: 500 })).status).toBe(400);
    expect((await post(app, { lat: "x", lng: 127 })).status).toBe(400);
  });

  it("데이터셋 없음([]) → region null(graceful)", async () => {
    const app = createGeocodeApp([]);
    const res = await post(app, { lat: 37.5, lng: 127 });
    expect(await res.json()).toEqual({ region: null });
  });
});
