// 선거 마스터 조회. 서버 계약(스펙 0007): GET /api/elections → { items: [{ id, name, type }] }.
// 필터/선택 옵션 채우기 용도. 실패 시 빈 목록(필터·드롭다운은 선택 사항이라 치명적이지 않음).

export type Election = {
  id: string;
  name: string;
  type: string;
};

export async function fetchElections(): Promise<Election[]> {
  try {
    const res = await fetch("/api/elections");
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Election[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}
