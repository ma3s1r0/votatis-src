import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "./api";
import Header from "../Header";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      navigate("/admin");
      return;
    }
    if (result.error === "rate_limited") {
      setError("로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요");
    } else {
      // 401(invalid_credentials)·기타 모두 동일 메시지 — 계정 존재 누설 금지
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
    }
  }

  return (
    <>
    <Header admin />
    <main className="container container--form">
      <div className="card">
        <h1>관리자 로그인</h1>
        <form onSubmit={onSubmit} className="form-grid">
          <label className="field">
            이메일
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            비밀번호
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" style={{ color: "var(--color-danger)", margin: 0 }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting} className="btn btn-primary">
            로그인
          </button>
        </form>
      </div>
    </main>
    </>
  );
}
