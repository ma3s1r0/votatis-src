// StoragePort — 첨부 스토리지(S3) 추상화. 실제 AWS SDK 호출은 구현체에 격리하고,
// 테스트는 InMemoryStorage 더블을 주입한다. 본 API 코드는 이 인터페이스만 의존한다.

import { AwsClient } from "aws4fetch";

export type PresignPutInput = {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
};

export type HeadObjectResult =
  | { exists: false }
  | { exists: true; size: number; sha256: string };

export type PresignGetInput = {
  key: string;
  expiresInSeconds: number;
};

export interface StoragePort {
  // 단기 만료 presigned PUT URL 발급. 메서드 PUT, Content-Type/Length 바인딩.
  presignPut(input: PresignPutInput): Promise<{ url: string; expiresInSeconds: number }>;
  // 단기 만료 presigned GET URL 발급(다운로드). 메서드 GET 한정.
  presignGet(input: PresignGetInput): Promise<{ url: string; expiresInSeconds: number }>;
  // 객체 존재·크기·sha256 확인(finalize 무결성 검증용).
  headObject(key: string): Promise<HeadObjectResult>;
}

// 테스트/로컬용 인메모리 스토리지 더블. presign 은 가짜 URL 을 만들고,
// put() 으로 "업로드"를 시뮬레이션하면 headObject 가 해당 객체를 반환한다.
export class InMemoryStorage implements StoragePort {
  private objects = new Map<string, { size: number; sha256: string }>();

  // uploadBase: presignPut URL 접두. 기본은 가짜 절대 URL(테스트용). dev 서버는
  // 실제 수신 라우트 접두("/api/dev/blob/")를 주입해 브라우저 PUT 이 동작하게 한다.
  constructor(private uploadBase = "https://fake-s3.local/") {}

  async presignPut(input: PresignPutInput) {
    const url = `${this.uploadBase}${input.key}?expires=${input.expiresInSeconds}`;
    return { url, expiresInSeconds: input.expiresInSeconds };
  }

  // presigned GET 더블. 객체 존재 여부와 무관하게 가짜 URL 을 반환한다(존재 게이트는
  // 라우트가 attachment.status=stored 로 강제 — presign 자체는 객체를 검증하지 않음).
  async presignGet(input: PresignGetInput) {
    const url = `https://fake-s3.local/${input.key}?method=GET&expires=${input.expiresInSeconds}`;
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

export type S3StorageConfig = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  // 선택: Lambda 실행 역할 등 임시 자격증명의 STS 세션 토큰. 지정 시 SigV4 서명에
  // X-Amz-Security-Token 으로 반영(미지정이면 정적 키 — IAM 유저 등). 누락 시 임시
  // 자격증명으로는 S3 가 403(InvalidToken).
  sessionToken?: string;
  // 선택: S3 호환 스토리지(로컬/온프레)용 엔드포인트 오버라이드. 미지정 시 AWS S3.
  endpoint?: string;
};

// 실 S3 StoragePort 구현. aws4fetch(SigV4)로 presigned URL 을 직접 계산한다.
//  - presignPut/presignGet 은 순수 서명 계산 — 네트워크 호출 없이 URL 만 만든다(단위 테스트 가능).
//  - headObject 는 실제 S3 HEAD 요청이 필요 → 배포 환경(자격증명·네트워크) 의존.
// 버킷·리전·자격증명은 모두 주입(env 출처) — 하드코딩 없음.
export class S3Storage implements StoragePort {
  private client: AwsClient;
  private baseUrl: string;

  constructor(private config: S3StorageConfig) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
      service: "s3",
      region: config.region,
    });
    const host =
      config.endpoint ??
      `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
    this.baseUrl = host.replace(/\/$/, "");
  }

  private objectUrl(key: string): string {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    if (this.config.endpoint) {
      // path-style: endpoint/bucket/key (S3 호환 스토리지)
      return `${this.baseUrl}/${this.config.bucket}/${encodedKey}`;
    }
    // virtual-hosted-style: bucket.s3.region.amazonaws.com/key
    return `${this.baseUrl}/${encodedKey}`;
  }

  async presignPut(input: PresignPutInput) {
    const url = new URL(this.objectUrl(input.key));
    url.searchParams.set("X-Amz-Expires", String(input.expiresInSeconds));
    const signed = await this.client.sign(url.toString(), {
      method: "PUT",
      headers: {
        "content-type": input.contentType,
        "content-length": String(input.contentLength),
      },
      aws: { signQuery: true },
    });
    return { url: signed.url, expiresInSeconds: input.expiresInSeconds };
  }

  async presignGet(input: PresignGetInput) {
    const url = new URL(this.objectUrl(input.key));
    url.searchParams.set("X-Amz-Expires", String(input.expiresInSeconds));
    const signed = await this.client.sign(url.toString(), {
      method: "GET",
      aws: { signQuery: true },
    });
    return { url: signed.url, expiresInSeconds: input.expiresInSeconds };
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const signed = await this.client.sign(this.objectUrl(key), {
      method: "HEAD",
    });
    const res = await fetch(signed);
    if (res.status === 404) return { exists: false };
    if (!res.ok) {
      throw new Error(`headObject failed: ${res.status}`);
    }
    const size = Number(res.headers.get("content-length") ?? "0");
    // S3 는 sha256 을 x-amz-checksum-sha256(베이스64) 로 줄 수 있으나, 업로드 시
    // 체크섬을 요구하지 않으면 없을 수 있다. ETag 는 MD5 라 무결성 sha256 과 다르다.
    // 무결성 sha256 검증은 제보 측에서 전달한 값과 대조하므로 여기선 헤더 그대로 전달.
    const sha256 = res.headers.get("x-amz-checksum-sha256") ?? "";
    return { exists: true, size, sha256 };
  }
}
