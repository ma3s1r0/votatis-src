import { describe, it, expect } from "vitest";
import { parseExifTiff } from "./exif";

// 0021: EXIF GPS IFD 파싱 단위 테스트.
// 실제 JPEG 대신 최소 TIFF 블록(little-endian)을 손으로 구성한다.
// 레이아웃(tiffStart=0):
//   0  : "II" 0x002A, IFD0 offset=8
//   8  : IFD0 (1 entry: GPS IFD pointer 0x8825 → 26), next=0
//   26 : GPS IFD (4 entries), next=0
//   80 : LAT rationals (37/1, 30/1, 0/1) = 37.5
//   104: LNG rationals (127/1, 0/1, 0/1) = 127.0
function buildTiffWithGps(latRef = "N", lngRef = "E"): DataView {
  const buf = new ArrayBuffer(128);
  const v = new DataView(buf);
  const LE = true;
  // TIFF 헤더
  v.setUint8(0, 0x49);
  v.setUint8(1, 0x49); // "II" little-endian
  v.setUint16(2, 0x2a, LE);
  v.setUint32(4, 8, LE); // IFD0 offset

  // IFD0: 1 entry
  v.setUint16(8, 1, LE);
  // entry: tag 0x8825(GPS IFD pointer), type 4(LONG), count 1, value=26
  v.setUint16(10, 0x8825, LE);
  v.setUint16(12, 4, LE);
  v.setUint32(14, 1, LE);
  v.setUint32(18, 26, LE);
  v.setUint32(22, 0, LE); // next IFD = 0

  // GPS IFD at 26: 4 entries
  v.setUint16(26, 4, LE);
  // 0x0001 GPSLatitudeRef, ASCII(2), count 2, inline "N\0"
  v.setUint16(28, 0x0001, LE);
  v.setUint16(30, 2, LE);
  v.setUint32(32, 2, LE);
  v.setUint8(36, latRef.charCodeAt(0));
  v.setUint8(37, 0);
  // 0x0002 GPSLatitude, RATIONAL(5), count 3, offset 80
  v.setUint16(40, 0x0002, LE);
  v.setUint16(42, 5, LE);
  v.setUint32(44, 3, LE);
  v.setUint32(48, 80, LE);
  // 0x0003 GPSLongitudeRef, ASCII(2), count 2, inline "E\0"
  v.setUint16(52, 0x0003, LE);
  v.setUint16(54, 2, LE);
  v.setUint32(56, 2, LE);
  v.setUint8(60, lngRef.charCodeAt(0));
  v.setUint8(61, 0);
  // 0x0004 GPSLongitude, RATIONAL(5), count 3, offset 104
  v.setUint16(64, 0x0004, LE);
  v.setUint16(66, 5, LE);
  v.setUint32(68, 3, LE);
  v.setUint32(72, 104, LE);
  v.setUint32(76, 0, LE); // next IFD = 0

  // LAT rationals: 37/1, 30/1, 0/1
  v.setUint32(80, 37, LE);
  v.setUint32(84, 1, LE);
  v.setUint32(88, 30, LE);
  v.setUint32(92, 1, LE);
  v.setUint32(96, 0, LE);
  v.setUint32(100, 1, LE);
  // LNG rationals: 127/1, 0/1, 0/1
  v.setUint32(104, 127, LE);
  v.setUint32(108, 1, LE);
  v.setUint32(112, 0, LE);
  v.setUint32(116, 1, LE);
  v.setUint32(120, 0, LE);
  v.setUint32(124, 1, LE);
  return v;
}

describe("parseExifTiff — GPS IFD 추출(0021)", () => {
  it("위/경도 RATIONAL(도/분/초)을 십진 좌표로 변환한다", () => {
    const meta = parseExifTiff(buildTiffWithGps(), 0);
    expect(meta.gps).toBeDefined();
    expect(meta.gps!.lat).toBeCloseTo(37.5, 5); // 37 + 30/60
    expect(meta.gps!.lng).toBeCloseTo(127.0, 5);
  });

  it("남위/서경 Ref 는 음수로 부호를 적용한다", () => {
    const meta = parseExifTiff(buildTiffWithGps("S", "W"), 0);
    expect(meta.gps!.lat).toBeCloseTo(-37.5, 5);
    expect(meta.gps!.lng).toBeCloseTo(-127.0, 5);
  });

  it("GPS IFD 가 없으면 gps 는 undefined", () => {
    // IFD0 에 GPS 포인터 없는 최소 TIFF
    const buf = new ArrayBuffer(16);
    const v = new DataView(buf);
    v.setUint8(0, 0x49);
    v.setUint8(1, 0x49);
    v.setUint16(2, 0x2a, true);
    v.setUint32(4, 8, true);
    v.setUint16(8, 0, true); // IFD0: 0 entries
    v.setUint32(10, 0, true); // next=0
    const meta = parseExifTiff(v, 0);
    expect(meta.gps).toBeUndefined();
  });
});
