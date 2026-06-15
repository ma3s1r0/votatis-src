// 클라이언트 1차 EXIF 검증 + MIME 이중검증 (스펙 0015).
// 보안 경계 아님 — 명백한 비원본(스크린샷·캡처)을 업로드 전 거르는 UX 게이트.
// 라이브러리 비의존: 순수 판정 함수(judgeAttachment)·매직넘버 sniff·최소 JPEG APP1 EXIF 파서.

export type ExifMeta = {
  dateTimeOriginal?: string;
  make?: string;
  model?: string;
};

export type BlockReason = "not_original" | "mime_mismatch";

export type Verdict =
  | { kind: "ok" }
  | { kind: "warn" } // EXIF 파싱 실패 폴백(결정 3): 경고 후 진행 허용
  | { kind: "blocked"; reason: BlockReason };

type DetectedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

// 신고 MIME(확장자/type) → 매직넘버로 판별한 실제 MIME 대조용.
const SIGNATURES: { mime: DetectedMime; match: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    match: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/webp",
    match: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: "application/pdf",
    match: (b) =>
      b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

function readHead(file: File, n: number): Promise<Uint8Array> {
  // FileReader 로 앞부분 바이트만 읽음(브라우저·jsdom 호환).
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, n));
  });
}

// 매직넘버로 실제 MIME 판별. 알 수 없으면 null.
export async function sniffMime(file: File): Promise<DetectedMime | null> {
  const head = await readHead(file, 16);
  for (const sig of SIGNATURES) {
    if (sig.match(head)) return sig.mime;
  }
  return null;
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

// 순수 판정: file(신고 mime) ↔ sniffed(실제 mime) ↔ exif(파싱 결과/실패 null).
// 라이브러리 비의존이라 테스트가 입력만으로 동작 검증 가능.
export function judgeAttachment(
  file: File,
  sniffed: DetectedMime | null,
  exif: ExifMeta | null,
): Verdict {
  // 1) MIME 이중검증: 실제 내용과 신고 MIME 불일치 시 차단(위장 파일 방지).
  if (sniffed && sniffed !== file.type) {
    return { kind: "blocked", reason: "mime_mismatch" };
  }

  // 2) 이미지가 아니면(PDF 등) EXIF 검사 제외(결정 4).
  if (!IMAGE_MIMES.includes(file.type)) {
    return { kind: "ok" };
  }

  // 3) EXIF 파싱 실패 폴백(결정 3): 경고 후 진행 허용.
  if (exif === null) {
    return { kind: "warn" };
  }

  // 4) 촬영시각 OR 기기 중 하나라도 있으면 원본으로 인정(결정 2).
  const hasMeta = Boolean(exif.dateTimeOriginal || exif.make || exif.model);
  if (hasMeta) return { kind: "ok" };
  return { kind: "blocked", reason: "not_original" };
}

// 최소 JPEG APP1(EXIF) 파서. exifr 등 미사용 — 의존성 추가 없이 핵심 태그만 추출.
// DateTimeOriginal(0x9003), Make(0x010F), Model(0x0110) 존재 여부 수준.
// 파싱 불가/비JPEG → null(폴백). PNG/WebP 도 현재 null 처리 → warn 경로(결정 4 관대).
async function extractJpegExif(file: File): Promise<ExifMeta | null> {
  // EXIF 는 보통 파일 앞부분. 64KB 만 읽어 APP1 탐색.
  const bytes = await readHead(file, 64 * 1024);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not JPEG

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  // 마커 순회하며 APP1(0xFFE1) 의 "Exif\0\0" 찾기.
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    if (marker === 0xe1) {
      const app1Start = offset + 4;
      // "Exif\0\0"
      if (
        view.getUint8(app1Start) === 0x45 &&
        view.getUint8(app1Start + 1) === 0x78 &&
        view.getUint8(app1Start + 2) === 0x69 &&
        view.getUint8(app1Start + 3) === 0x66
      ) {
        return parseTiff(view, app1Start + 6);
      }
    }
    offset += 2 + size;
  }
  // APP1/Exif 미발견 → EXIF 없음(빈 메타). null 이 아닌 빈 객체로 "차단" 판정 가능.
  return {};
}

// TIFF 헤더(바이트오더 + IFD0) 에서 Make/Model/ExifIFD→DateTimeOriginal 추출.
function parseTiff(view: DataView, tiffStart: number): ExifMeta {
  try {
    const le = view.getUint16(tiffStart) === 0x4949; // II=little, MM=big
    const u16 = (o: number) => view.getUint16(o, le);
    const u32 = (o: number) => view.getUint32(o, le);

    const ifd0 = tiffStart + u32(tiffStart + 4);
    const meta: ExifMeta = {};

    const readAscii = (entry: number): string => {
      const count = u32(entry + 4);
      const valOff = count <= 4 ? entry + 8 : tiffStart + u32(entry + 8);
      let s = "";
      for (let i = 0; i < count - 1; i++) {
        const c = view.getUint8(valOff + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    };

    const scanIfd = (ifdStart: number, onExifPointer?: (p: number) => void) => {
      const n = u16(ifdStart);
      for (let i = 0; i < n; i++) {
        const entry = ifdStart + 2 + i * 12;
        const tag = u16(entry);
        if (tag === 0x010f) meta.make = readAscii(entry).trim() || undefined;
        else if (tag === 0x0110) meta.model = readAscii(entry).trim() || undefined;
        else if (tag === 0x8769 && onExifPointer)
          onExifPointer(tiffStart + u32(entry + 8));
        else if (tag === 0x9003)
          meta.dateTimeOriginal = readAscii(entry).trim() || undefined;
      }
    };

    scanIfd(ifd0, (exifIfd) => scanIfd(exifIfd));
    return meta;
  } catch {
    return {};
  }
}

// 오케스트레이터: 위저드가 호출. sniff + EXIF 추출 + 순수 판정.
export async function inspectAttachment(file: File): Promise<Verdict> {
  let sniffed: DetectedMime | null = null;
  let exif: ExifMeta | null = null;
  try {
    sniffed = await sniffMime(file);
    if (file.type === "image/jpeg") {
      exif = await extractJpegExif(file);
    } else if (IMAGE_MIMES.includes(file.type)) {
      // png/webp: 경량 파서 미보유 → null 폴백(결정 4 관대: warn).
      exif = null;
    }
  } catch {
    // 파싱 자체 실패 → 폴백(warn) 경로.
    exif = null;
  }
  return judgeAttachment(file, sniffed, exif);
}
