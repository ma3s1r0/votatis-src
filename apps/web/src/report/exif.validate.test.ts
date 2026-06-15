import { describe, it, expect } from "vitest";
import { sniffMime, judgeAttachment, type ExifMeta } from "./exif";

// 매직넘버 시그니처 픽스처 (앞부분 바이트만)
function bytesFile(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // %PDF-1.4
const WEBP = [
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

describe("sniffMime (매직넘버 판별)", () => {
  it("JPEG 시그니처를 image/jpeg 로 판별한다", async () => {
    expect(await sniffMime(bytesFile(JPEG, "a.jpg", "image/jpeg"))).toBe(
      "image/jpeg",
    );
  });
  it("PNG 시그니처를 image/png 로 판별한다", async () => {
    expect(await sniffMime(bytesFile(PNG, "a.png", "image/png"))).toBe(
      "image/png",
    );
  });
  it("WEBP(RIFF…WEBP) 시그니처를 image/webp 로 판별한다", async () => {
    expect(await sniffMime(bytesFile(WEBP, "a.webp", "image/webp"))).toBe(
      "image/webp",
    );
  });
  it("PDF 시그니처를 application/pdf 로 판별한다", async () => {
    expect(await sniffMime(bytesFile(PDF, "a.pdf", "application/pdf"))).toBe(
      "application/pdf",
    );
  });
  it("알 수 없는 시그니처는 null 을 반환한다", async () => {
    expect(await sniffMime(bytesFile([0x00, 0x01, 0x02, 0x03], "x", "x"))).toBe(
      null,
    );
  });
});

describe("judgeAttachment (순수 판정)", () => {
  const exifJpeg = bytesFile(JPEG, "p.jpg", "image/jpeg");
  const noExif: ExifMeta = {};
  const withTime: ExifMeta = { dateTimeOriginal: "2026:06:15 10:00:00" };
  const withDevice: ExifMeta = { make: "Apple", model: "iPhone 15" };

  it("EXIF 촬영시각/기기가 모두 없는 JPEG 는 차단(not_original)", () => {
    const v = judgeAttachment(exifJpeg, "image/jpeg", noExif);
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toBe("not_original");
  });

  it("EXIF 촬영시각이 있으면 통과", () => {
    expect(judgeAttachment(exifJpeg, "image/jpeg", withTime).kind).toBe("ok");
  });

  it("EXIF 기기정보가 있으면 통과", () => {
    expect(judgeAttachment(exifJpeg, "image/jpeg", withDevice).kind).toBe("ok");
  });

  it("MIME 이중검증 불일치(.jpg 인데 실제 PDF)는 차단(mime_mismatch)", () => {
    const fake = bytesFile(PDF, "fake.jpg", "image/jpeg");
    const v = judgeAttachment(fake, "application/pdf", withTime);
    expect(v.kind).toBe("blocked");
    if (v.kind === "blocked") expect(v.reason).toBe("mime_mismatch");
  });

  it("PDF 는 EXIF 검사 대상에서 제외되어 통과한다", () => {
    const pdf = bytesFile(PDF, "doc.pdf", "application/pdf");
    expect(judgeAttachment(pdf, "application/pdf", noExif).kind).toBe("ok");
  });

  it("EXIF 파싱 실패(null) 폴백 = 경고 후 진행 허용(warn)", () => {
    const v = judgeAttachment(exifJpeg, "image/jpeg", null);
    expect(v.kind).toBe("warn");
  });
});
