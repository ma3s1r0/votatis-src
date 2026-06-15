// StoragePort — 첨부 스토리지(S3) 추상화. 실제 AWS SDK 호출은 구현체에 격리하고,
// 테스트는 InMemoryStorage 더블을 주입한다. 본 API 코드는 이 인터페이스만 의존한다.

export type PresignPutInput = {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
};

export type HeadObjectResult =
  | { exists: false }
  | { exists: true; size: number; sha256: string };

export interface StoragePort {
  // 단기 만료 presigned PUT URL 발급. 메서드 PUT, Content-Type/Length 바인딩.
  presignPut(input: PresignPutInput): Promise<{ url: string; expiresInSeconds: number }>;
  // 객체 존재·크기·sha256 확인(finalize 무결성 검증용).
  headObject(key: string): Promise<HeadObjectResult>;
}

// 테스트/로컬용 인메모리 스토리지 더블. presign 은 가짜 URL 을 만들고,
// put() 으로 "업로드"를 시뮬레이션하면 headObject 가 해당 객체를 반환한다.
export class InMemoryStorage implements StoragePort {
  private objects = new Map<string, { size: number; sha256: string }>();

  async presignPut(input: PresignPutInput) {
    const url = `https://fake-s3.local/${input.key}?expires=${input.expiresInSeconds}`;
    return { url, expiresInSeconds: input.expiresInSeconds };
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const obj = this.objects.get(key);
    if (!obj) return { exists: false };
    return { exists: true, size: obj.size, sha256: obj.sha256 };
  }

  // 테스트 헬퍼: presigned PUT 으로 실제 업로드가 일어난 상황을 흉내낸다.
  put(key: string, size: number, sha256: string): void {
    this.objects.set(key, { size, sha256 });
  }
}
