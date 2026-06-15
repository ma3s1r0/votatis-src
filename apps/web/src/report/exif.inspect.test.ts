import { describe, it, expect } from "vitest";
import { inspectAttachment } from "./exif";

// QA 회귀(0015): 오케스트레이터 inspectAttachment 를 실제 바이트로 통과시켜
// JPEG APP1 EXIF 파서 + sniff + 판정의 실제 결선을 검증한다.
// (위저드 통합 테스트는 inspectAttachment 를 모킹하므로, 실제 파서 경로는 미커버였다.)
function bytesFile(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

// 최소 JPEG: SOI + APP1(Exif, TIFF II, IFD0 Make="Apple") + EOI
const JPEG_WITH_EXIF = [
  255, 216, 255, 225, 0, 40, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0,
  1, 0, 15, 1, 2, 0, 6, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0, 65, 112, 112, 108,
  101, 0, 255, 217,
];
// 최소 JPEG: SOI + APP0(JFIF) + EOI — EXIF 없음(스크린샷류 모사)
const JPEG_NO_EXIF = [
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255,
  217,
];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const WEBP = [
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

describe("inspectAttachment (오케스트레이터 — 실제 바이트)", () => {
  it("EXIF(기기) 있는 실제 JPEG 는 통과(ok)한다", async () => {
    const f = bytesFile(JPEG_WITH_EXIF, "photo.jpg", "image/jpeg");
    expect((await inspectAttachment(f)).kind).toBe("ok");
  });

  it("EXIF 없는 실제 JPEG 는 차단(not_original)된다 — 실제 파서 경로", async () => {
    const f = bytesFile(JPEG_NO_EXIF, "shot.jpg", "image/jpeg");
    const v = await inspectAttachment(f);
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toBe("not_original");
  });

  it("확장자 .jpg 인데 실제 PDF 면 차단(mime_mismatch)", async () => {
    const f = bytesFile(PDF, "fake.jpg", "image/jpeg");
    const v = await inspectAttachment(f);
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toBe("mime_mismatch");
  });

  it("PDF 는 EXIF 검사 제외되어 통과한다(MIME 일치)", async () => {
    const f = bytesFile(PDF, "doc.pdf", "application/pdf");
    expect((await inspectAttachment(f)).kind).toBe("ok");
  });

  it("WebP 는 파서 미보유 → fail-open(warn) — 결정 4 관대 폴백", async () => {
    const f = bytesFile(WEBP, "p.webp", "image/webp");
    expect((await inspectAttachment(f)).kind).toBe("warn");
  });
});
