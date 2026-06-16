import { chromium } from "playwright";
const BASE = "http://localhost:5174";
const log = (...a) => console.log("[QA2]", ...a);
const browser = await chromium.launch({ channel: "chrome", headless: true });

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill("votatis-dev-1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL("**/admin", { timeout: 8000 });
  await page.getByRole("heading", { name: "검수 큐" }).waitFor({ timeout: 8000 });
  return { ctx, page };
}

async function approve(page, reportId) {
  await page.goto(BASE + "/admin/reports/" + reportId, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "교차검증" }).waitFor({ timeout: 8000 });
  const before = (await page.locator("body").innerText()).match(/(\d)\s*\/\s*2/)?.[0];
  // 이미 동의한 상태면 스킵
  if ((await page.getByText(/이미 동의/).count()) > 0) {
    return { before, after: before, already: true };
  }
  // 폼을 먼저 채워야 제출 버튼이 활성화됨(method + 근거 ≥1)
  await page.getByLabel("검증 방법").fill("교차 확인");
  const ev = page.getByTestId("evidence-link-0");
  await ev.getByLabel("URL", { exact: true }).fill("https://example.org/e");
  await ev.getByLabel("수집 시각").fill("2026-06-12T10:00");
  await ev.getByLabel("콘텐츠 해시").fill("h-" + Math.random().toString(16).slice(2, 8));
  await page.getByLabel("심각도 (1–5)").fill("3");
  const btn = page.getByRole("button", { name: /검증 승인/ });
  if (await btn.isDisabled()) {
    return { before, after: before, disabledAfterFill: true };
  }
  await btn.click();
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  const err = /out_of_range|severity|실패/i.test(body);
  const after = body.match(/(\d)\s*\/\s*2\s*동의|검증 완료/)?.[0];
  return { before, after, err };
}

try {
  // reviewer 1 (admin)
  const a = await login("admin@votatis.local");
  // 첫 검수 큐 항목의 reportId 추출
  const href = await a.page.locator("a.archive-item__title").first().getAttribute("href");
  const reportId = href.split("/").pop();
  const title = (await a.page.locator("a.archive-item__title").first().textContent())?.trim();
  log("대상 제보:", title, reportId);

  const r1 = await approve(a.page, reportId);
  log("reviewer1(admin) 승인:", JSON.stringify(r1));
  await a.page.screenshot({ path: "/tmp/r2-after1.png", fullPage: true });

  // reviewer 2
  const b = await login("reviewer2@votatis.local");
  const r2 = await approve(b.page, reportId);
  log("reviewer2 승인:", JSON.stringify(r2));
  await b.page.screenshot({ path: "/tmp/r2-after2.png", fullPage: true });

  // 공개 아카이브에 떴는지(검색)
  const pub = b.page;
  await pub.goto(BASE + "/archive", { waitUntil: "networkidle" });
  await pub.waitForTimeout(800);
  const inArchive = (await pub.locator("a.archive-item__title", { hasText: title?.slice(0, 8) ?? "" }).count()) > 0;
  log("2/2 확정 후 공개 아카이브 노출:", inArchive ? "✅" : "❌(미노출/검색범위)");

  log("RESULT:", r2.after?.includes("검증 완료") || r2.after?.startsWith("2") ? "✅ 2인 동의로 검증 완료 동작" : "⚠️ 2/2 미확정");
} catch (e) {
  log("오류:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
