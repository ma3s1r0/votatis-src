import { useNavigate } from "react-router-dom";
import { logout } from "./api";

// 인증 필요한 자리표시 화면. 0004 라벨링·검증 콘솔이 여기로 채워진다.
export default function AdminHome() {
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/admin/login");
  }

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>관리자 콘솔</h1>
      <p>인증되었습니다. (라벨링·검증 콘솔은 0004에서 구현)</p>
      <button onClick={onLogout}>로그아웃</button>
    </main>
  );
}
