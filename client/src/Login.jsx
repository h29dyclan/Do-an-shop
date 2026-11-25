import { useState } from "react";
import "./Login.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function Login({ onLogin, onClose }) {
  const [mode, setMode] = useState("login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Trạng thái hiển thị mật khẩu
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    if (isRegister) {
      if (!fullName.trim()) {
        setError("Vui lòng nhập họ tên.");
        return;
      }

      if (password.length < 8 || password.length > 72) {
        setError("Mật khẩu phải dài từ 8 đến 72 ký tự.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Mật khẩu xác nhận không khớp.");
        return;
      }
    }

    try {
      setLoading(true);

      const endpoint = isRegister
        ? "/auth/register"
        : "/auth/login";

      const body = isRegister
        ? {
            full_name: fullName.trim(),
            email: normalizedEmail,
            password,
          }
        : {
            email: normalizedEmail,
            password,
          };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            (isRegister
              ? "Đăng ký tài khoản thất bại."
              : "Đăng nhập thất bại.")
        );
      }

      // Đăng ký thành công: chuyển về màn hình đăng nhập.
      if (isRegister) {
        setSuccess(
          data.message ||
            "Đăng ký thành công. Vui lòng đăng nhập."
        );

        setMode("login");
        setFullName("");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        return;
      }

      // Đăng nhập phải có token và thông tin tài khoản.
      if (!data.token || !data.user) {
        throw new Error(
          "Dữ liệu đăng nhập từ máy chủ không hợp lệ."
        );
      }

      if (
        data.user.role !== "admin" &&
        data.user.role !== "customer"
      ) {
        throw new Error("Loại tài khoản không hợp lệ.");
      }

      // Lưu token sau khi máy chủ xác nhận đăng nhập thành công.
      sessionStorage.setItem("techshop_token", data.token);

      // Báo cho App.jsx biết tài khoản vừa đăng nhập.
      if (typeof onLogin === "function") {
        onLogin(data.user, data.token);
      }

      setSuccess(
        `Đăng nhập thành công với tài khoản ${
          data.user.role === "admin" ? "Admin" : "khách hàng"
        }.`
      );
    } catch (err) {
      setError(
        err.message ||
          "Không thể kết nối máy chủ. Hãy kiểm tra backend."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-logo">D</div>

          <div>
            <h1>DuyHshop</h1>
            <p>TECHNOLOGY STORE</p>
          </div>
        </div>

        <div className="login-heading">
          <h2>
            {isRegister
              ? "Tạo tài khoản"
              : "Chào mừng trở lại"}
          </h2>

          <p>
            {isRegister
              ? "Đăng ký để mua sắm tại DuyHshop."
              : "Đăng nhập để tiếp tục sử dụng DuyHshop."}
          </p>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={!isRegister ? "active" : ""}
            onClick={() => changeMode("login")}
            disabled={loading}
          >
            Đăng nhập
          </button>

          <button
            type="button"
            className={isRegister ? "active" : ""}
            onClick={() => changeMode("register")}
            disabled={loading}
          >
            Đăng ký
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="login-field">
              <label htmlFor="fullName">Họ và tên</label>

              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(event) =>
                  setFullName(event.target.value)
                }
                placeholder="Nhập họ và tên"
                autoComplete="name"
                maxLength={100}
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="Nhập địa chỉ email"
              autoComplete="email"
              maxLength={254}
              required
              disabled={loading}
            />
          </div>

          {/* Mật khẩu */}
          <div className="login-field">
            <label htmlFor="password">Mật khẩu</label>

            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder={
                  isRegister
                    ? "Tạo mật khẩu (ít nhất 8 ký tự)"
                    : "Nhập mật khẩu"
                }
                autoComplete={
                  isRegister
                    ? "new-password"
                    : "current-password"
                }
                minLength={isRegister ? 8 : undefined}
                maxLength={72}
                required
                disabled={loading}
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
                title={
                  showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3M6.2 6.2C3.8 7.8 2.5 10.2 2 12c1 2.5 4.5 7 10 7 1.3 0 2.5-.3 3.5-.7" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Xác nhận mật khẩu khi đăng ký */}
          {isRegister && (
            <div className="login-field">
              <label htmlFor="confirmPassword">
                Xác nhận mật khẩu
              </label>

              <div className="password-wrapper">
                <input
                  id="confirmPassword"
                  type={
                    showConfirmPassword ? "text" : "password"
                  }
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                  maxLength={72}
                  required
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(!showConfirmPassword)
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Ẩn mật khẩu xác nhận"
                      : "Hiện mật khẩu xác nhận"
                  }
                  title={
                    showConfirmPassword
                      ? "Ẩn mật khẩu"
                      : "Hiện mật khẩu"
                  }
                >
                  {showConfirmPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3M6.2 6.2C3.8 7.8 2.5 10.2 2 12c1 2.5 4.5 7 10 7 1.3 0 2.5-.3 3.5-.7" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="login-success" role="status">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading
              ? "Đang xử lý..."
              : isRegister
                ? "Tạo tài khoản"
                : "Đăng nhập"}
          </button>
        </form>

        <div className="login-bottom">
          {isRegister ? (
            <p>
              Đã có tài khoản?{" "}
              <button
                type="button"
                onClick={() => changeMode("login")}
                disabled={loading}
              >
                Đăng nhập
              </button>
            </p>
          ) : (
            <p>
              Chưa có tài khoản?{" "}
              <button
                type="button"
                onClick={() => changeMode("register")}
                disabled={loading}
              >
                Đăng ký ngay
              </button>
            </p>
          )}

          {typeof onClose === "function" && (
            <button
              type="button"
              className="login-back"
              onClick={onClose}
              disabled={loading}
            >
              Quay lại cửa hàng
            </button>
          )}
        </div>

        <p className="login-footer">
          DuyHshop · Công nghệ cho cuộc sống hiện đại
        </p>
      </section>
    </main>
  );
}

export default Login;
