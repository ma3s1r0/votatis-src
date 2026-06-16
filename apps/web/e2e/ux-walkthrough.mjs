import { chromium } from "playwright";

const BASE = "http://localhost:5174";
const findings = [];
const note = (persona, s) => findings.push(`[${persona}] ${s}`);
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("console.error: " + m.text());
  });
  return { ctx, page, errs };
}

// ─────────────────────────── 일반 사용자 ───────────────────────────
{
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/ux-01-landing.png", fullPage: true });
  for (const name of [/증거 제보하기/, /검증 아카이브 보기/, /상태 조회/]) {
    if ((await page.getByRole("link", { name }).count()) === 0)
      note("user", `랜딩 CTA 누락: ${name}`);
  }

  // 제보 작성
  await page.getByRole("link", { name: /증거 제보하기/ }).click();
  await page.waitForURL("**/report");
  await page.getByLabel("상세 설명").fill("개표소에서 봉인 훼손 정황을 직접 목격함");
  await page.getByLabel("위치", { exact: true }).fill("서울특별시 강남구 제3투표소");
  await page.getByLabel("의혹 유형").selectOption({ index: 1 });
  const submitBtn = page.getByRole("button", { name: "제보 제출" });
  if (!(await submitBtn.isDisabled()))
    note("user", "동의 전 제출 버튼이 활성(비활성이어야 함)");
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: "/tmp/ux-02-report.png", fullPage: true });
  await submitBtn.click();
  await page.getByRole("heading", { name: "제보가 접수되었습니다" }).waitFor({ timeout: 8000 });
  const tn = (await page.locator(".done-card__tracking").textContent())?.trim();
  note("user", tn ? `제보 접수번호 발급: ${tn}` : "접수번호 미발급(이상)");
  await page.screenshot({ path: "/tmp/ux-03-done.png", fullPage: true });

  // 상태 조회(완료 화면 링크)
  await page.getByRole("link", { name: /상태 조회/ }).click();
  await page.waitForURL("**/track**");
  await page.waitForTimeout(1500);
  const trackText = await page.locator("body").innerText();
  note("user", /접수됨|검수/.test(trackText) ? "상태조회 타임라인 표시됨" : "타임라인 미표시");
  note("user", /내 제보 목록/.test(trackText) ? "내 제보 목록 노출됨" : "내 제보 목록 미노출");
  await page.screenshot({ path: "/tmp/ux-04-track.png", fullPage: true });

  // 아카이브 → 상세
  await page.goto(BASE + "/archive", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/ux-05-archive.png", fullPage: true });
  const firstCard = page.locator("a.archive-item__title").first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForURL("**/archive/**");
    await page.waitForTimeout(500);
    const disc = page.locator("details.more-data > summary");
    if (await disc.count()) await disc.click();
    await page.screenshot({ path: "/tmp/ux-06-detail.png", fullPage: true });
  } else note("user", "아카이브 공개 카드 0건(상세 검증 불가)");

  // 지도
  await page.goto(BASE + "/map", { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  const tiles = await page.locator(".leaflet-tile-loaded").count();
  note("user", tiles > 0 ? `지도 타일 로드됨(${tiles})` : "지도 타일 미로드(네트워크?)");
  await page.screenshot({ path: "/tmp/ux-07-map.png", fullPage: true });

  // 내 제보 탭
  await page.goto(BASE + "/my", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/ux-08-my.png", fullPage: true });

  if (errs.length) note("user", "JS 에러: " + errs.join(" | "));
  await ctx.close();
}

// ─────────────────────────── 어드민 / 검수자 ───────────────────────────
{
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill("admin@votatis.local");
  await page.locator("input[type=password]").fill("votatis-dev-1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL("**/admin", { timeout: 8000 });
  await page.getByRole("heading", { name: "검수 큐" }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: "/tmp/ux-09-queue.png", fullPage: true });

  await page.locator("a.archive-item__title").first().click();
  await page.waitForURL("**/admin/reports/**");
  await page.getByRole("heading", { name: "교차검증" }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: "/tmp/ux-10-admin-detail.png", fullPage: true });

  // 검수자: 판정 제출
  await page.getByLabel("검증 방법").fill("공개 개표 데이터 교차 확인");
  const ev = page.getByTestId("evidence-link-0");
  await ev.getByLabel("URL", { exact: true }).fill("https://example.org/e/1");
  await ev.getByLabel("수집 시각").fill("2026-06-12T10:00");
  await ev.getByLabel("콘텐츠 해시").fill("hash-aaa");
  await page.getByLabel("심각도 (1–5)").fill("3");
  await page.getByRole("button", { name: /검증 승인/ }).click();
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  note("reviewer", /out_of_range|severity/i.test(body) ? "❌ 검증 제출 오류(out_of_range)" : "✅ 검증 제출 정상");
  note("reviewer", "진행도: " + (body.match(/\d\s*\/\s*2\s*동의|검증 완료|이미 동의/)?.[0] ?? "미확인"));
  await page.screenshot({ path: "/tmp/ux-11-admin-verify.png", fullPage: true });

  if (errs.length) note("admin", "JS 에러: " + errs.join(" | "));
  await ctx.close();
}

console.log("=== UX FINDINGS ===");
for (const f of findings) console.log(f);
await browser.close();
