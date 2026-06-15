import { Link } from "react-router-dom";
import TabBar from "./TabBar";
import { getMyReports } from "./track/storage";

// 내 제보(스펙 0013). localStorage 의 접수번호 목록을 카드로 표시.
// 익명 유지(결정 5): 서버에 제보자-번호 매핑 없음 → 이 기기에 저장된 번호만 보인다.
export default function MyReportsPage() {
  const numbers = getMyReports();

  return (
    <>
      <main className="container">
        <h1>내 제보</h1>
        <p className="page-intro">
          이 기기에서 제출한 제보의 접수번호입니다. 번호를 눌러 진행 상태를
          조회할 수 있습니다.
        </p>

        {numbers.length === 0 ? (
          <div className="placeholder-card">
            <p className="placeholder-card__title">아직 제보 내역이 없습니다</p>
            <p className="placeholder-card__body">
              제보를 제출하면 접수번호가 이곳에 저장됩니다.
            </p>
            <Link to="/report" className="btn btn-primary">
              제보하기
            </Link>
          </div>
        ) : (
          <ul className="my-reports">
            {numbers.map((n) => (
              <li key={n} className="my-reports__item">
                <Link
                  to={`/track?number=${encodeURIComponent(n)}`}
                  className="my-reports__link"
                >
                  <span className="my-reports__number">{n}</span>
                  <span className="my-reports__action">상태 조회</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <TabBar />
    </>
  );
}
