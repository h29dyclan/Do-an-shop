import { useCallback, useEffect, useState } from "react";
import "./MyOrders.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const STATUS_LABELS = {
  pending: "Chờ xác nhận",
  processing: "Đang xử lý",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

function formatPrice(price) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

function MyOrders({ onBack, onUnauthorized }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    const token = sessionStorage.getItem("techshop_token");
    if (!token) {
      onUnauthorized?.();
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_URL}/my-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || "Không thể tải lịch sử đơn hàng.");
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Không thể kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  return (
    <main className="my-orders-page">
      <header className="my-orders-header">
        <div>
          <p className="my-orders-eyebrow">TÀI KHOẢN KHÁCH HÀNG</p>
          <h1>Lịch sử đơn hàng</h1>
          <p>Theo dõi trạng thái và xem lại các sản phẩm bạn đã đặt.</p>
        </div>
        <div className="my-orders-actions">
          <button type="button" onClick={loadOrders} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
          <button type="button" className="my-orders-back" onClick={onBack}>
            Quay lại cửa hàng
          </button>
        </div>
      </header>

      {error && <p className="my-orders-error">{error}</p>}
      {loading && <p className="my-orders-empty">Đang tải đơn hàng...</p>}

      {!loading && !error && orders.length === 0 && (
        <section className="my-orders-empty">
          <h2>Bạn chưa có đơn hàng nào</h2>
          <p>Các đơn hàng bạn đặt khi đăng nhập sẽ xuất hiện tại đây.</p>
          <button type="button" onClick={onBack}>Tiếp tục mua sắm</button>
        </section>
      )}

      {!loading && orders.length > 0 && (
        <section className="my-orders-list">
          {orders.map((order) => (
            <article className="my-order-card" key={order.id}>
              <div className="my-order-top">
                <div>
                  <h2>Đơn hàng #{order.id}</h2>
                  <p>Đặt lúc: {formatDate(order.created_at)}</p>
                </div>
                <span className={`my-order-status status-${order.status}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="my-order-progress" aria-label="Tiến trình đơn hàng">
                {["pending", "processing", "completed"].map((status, index) => {
                  const sequence = ["pending", "processing", "completed"];
                  const currentIndex = sequence.indexOf(order.status);
                  const done = order.status !== "cancelled" && currentIndex >= index;
                  return (
                    <div className={`my-order-step ${done ? "is-done" : ""}`} key={status}>
                      <span>{index + 1}</span>
                      <small>{STATUS_LABELS[status]}</small>
                    </div>
                  );
                })}
              </div>

              {order.status === "cancelled" && (
                <p className="my-order-cancelled">Đơn hàng này đã bị hủy.</p>
              )}

              <div className="my-order-items">
                {(order.items || []).map((item) => (
                  <div className="my-order-item" key={item.id}>
                    <span>{item.product_name} × {item.quantity}</span>
                    <strong>{formatPrice(item.subtotal ?? item.unit_price * item.quantity)}</strong>
                  </div>
                ))}
              </div>

              <div className="my-order-shipping">
                <div><span>Người nhận</span><strong>{order.customer_name}</strong></div>
                <div><span>Số điện thoại</span><strong>{order.phone}</strong></div>
                <div><span>Địa chỉ giao hàng</span><strong>{order.address}</strong></div>
              </div>

              <div className="my-order-total">
                <span>Tổng thanh toán</span>
                <strong>{formatPrice(order.total_amount)}</strong>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default MyOrders;
