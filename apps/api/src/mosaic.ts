// MosaicPort — 집회(assembly) 첨부의 공개본(얼굴 모자이크) 생성 추상화(0016).
// 실 얼굴검출/블러는 인프라(추론 파이프라인) 의존이라 본 스펙에서 비목표 —
// 여기서는 인터페이스와 호출 지점·분리 저장·멱등만 정의하고, 테스트는 FakeMosaic
// 더블을 주입한다. 실 구현체(예: 람다/큐 기반)는 S3Storage 처럼 후속 인프라 스펙에서
// 같은 인터페이스로 주입한다.

// 스토리지 키 prefix 분리(0016 결정 2). 원본은 절대 외부 미노출, 공개본만 노출.
export const ORIGINAL_PREFIX = "original/";
export const PUBLIC_PREFIX = "public/";

// 원본 키 → 공개본 키 매핑. original/ prefix 를 public/ 으로 치환.
// original/ 로 시작하지 않는 (레거시) 키는 public/ 을 단순 prepend.
export function publicKeyFor(originalKey: string): string {
  if (originalKey.startsWith(ORIGINAL_PREFIX)) {
    return PUBLIC_PREFIX + originalKey.slice(ORIGINAL_PREFIX.length);
  }
  return PUBLIC_PREFIX + originalKey;
}

export interface MosaicPort {
  // 원본 키를 받아 모자이크된 공개본을 생성·저장하고 그 키를 반환한다.
  process(input: { originalKey: string }): Promise<{ publicKey: string }>;
}

// 테스트/로컬용 더블. 실 픽셀 처리 없이 원본을 public/ 키로 "복사"했다고 가정하고,
// 호출 횟수·인자를 기록해 멱등·호출 단위검증을 돕는다.
export class FakeMosaic implements MosaicPort {
  public calls: { originalKey: string }[] = [];

  async process(input: { originalKey: string }): Promise<{ publicKey: string }> {
    this.calls.push({ originalKey: input.originalKey });
    return { publicKey: publicKeyFor(input.originalKey) };
  }
}
