import { useEffect, useState } from "react";
import "./AdminOrders.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const formatPrice = (price) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price || 0);

const formatDate = (date) => {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleString("vi-VN");
};

// Gửi token JWT cho các API quản trị.
async function adminFetch(url, options = {}, onUnauthorized) {
  const token = sessionStorage.getItem("techshop_token");
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    sessionStorage.removeItem("techshop_token");
    if (typeof onUnauthorized === "function") onUnauthorized();
  }

  return response;
}

const statusLabels = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  completed: "Đã hoàn thành",
  cancelled: "Đã hủy",
};

function AdminOrders({ onBack, onUnauthorized }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await adminFetch(
        `${API_URL}/orders`,
        {},
        onUnauthorized
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            (response.status === 403
              ? "Tài khoản không có quyền xem đơn hàng."
              : "Không thể tải danh sách đơn hàng.")
        );
      }

      if (!Array.isArray(data)) {
        throw new Error("Dữ liệu đơn hàng không đúng định dạng.");
      }

      setOrders(data);
    } catch (err) {
      setError(err.message || "Đã xảy ra lỗi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const viewOrder = async (id) => {
    try {
      setError("");

      const response = await adminFetch(
        `${API_URL}/orders/${id}`,
        {},
        onUnauthorized
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            (response.status === 403
              ? "Tài khoản không có quyền xem chi tiết đơn hàng."
              : "Không thể tải chi tiết đơn hàng.")
        );
      }

      setSelectedOrder(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const updateStatus = async (order, status) => {
    if (order.status === "completed" || order.status === "cancelled") {
      return;
    }

    if (
      status === "cancelled" &&
      !window.confirm(`Bạn có chắc muốn hủy đơn hàng #${order.id}?`)
    ) {
      return;
    }

    try {
      setUpdatingId(order.id);
      setError("");

      const response = await adminFetch(
        `${API_URL}/orders/${order.id}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
        onUnauthorized
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            (response.status === 403
              ? "Tài khoản không có quyền cập nhật đơn hàng."
              : "Không thể cập nhật trạng thái.")
        );
      }

      await loadOrders();

      if (selectedOrder?.id === order.id) {
        await viewOrder(order.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesStatus =
      filterStatus === "all" || order.status === filterStatus;

    const keyword = search.trim().toLowerCase();

    const matchesSearch =
      !keyword ||
      String(order.id).includes(keyword) ||
      (order.customer_name || "").toLowerCase().includes(keyword) ||
      (order.phone || "").toLowerCase().includes(keyword);

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="admin-orders-page">
      <header className="orders-header">
        <div>
          <p className="orders-eyebrow">DUYHSHOP ADMIN</p>
          <h1>Quản lý đơn hàng</h1>
          <p>Theo dõi và cập nhật tình trạng đơn hàng của khách.</p>
        </div>

        <button className="orders-back-button" onClick={onBack}>
          ← Quay lại cửa hàng
        </button>
      </header>

      <div className="orders-summary">
        <div className="orders-summary-card">
          <span>Tổng đơn hàng</span>
          <strong>{orders.length}</strong>
        </div>

        <div className="orders-summary-card">
          <span>Chờ xử lý</span>
          <strong>
            {orders.filter((o) => o.status === "pending").length}
          </strong>
        </div>

        <div className="orders-summary-card">
          <span>Đang xử lý</span>
          <strong>
            {orders.filter((o) => o.status === "processing").length}
          </strong>
        </div>

        <div className="orders-summary-card">
          <span>Đã hoàn thành</span>
          <strong>
            {orders.filter((o) => o.status === "completed").length}
          </strong>
        </div>
      </div>

      {error && <div className="orders-error">{error}</div>}

      <section className="orders-panel">
        <div className="orders-toolbar">
          <input
            type="text"
            placeholder="Tìm theo mã đơn, tên khách hoặc số điện thoại..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ xử lý</option>
            <option value="processing">Đang xử lý</option>
            <option value="completed">Đã hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
          </select>

          <button onClick={loadOrders} disabled={loading}>
            Làm mới
          </button>
        </div>

        {loading ? (
          <p className="orders-empty">Đang tải đơn hàng...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="orders-empty">Không tìm thấy đơn hàng.</p>
        ) : (
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Điện thoại</th>
                  <th>Số lượng</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th>Ngày đặt</th>
                  <th>Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{order.customer_name}</td>
                    <td>{order.phone}</td>
                    <td>{order.total_quantity}</td>
                    <td className="orders-price">
                      {formatPrice(order.total_amount)}
                    </td>
                    <td>
                      <span
                        className={`order-status status-${order.status}`}
                      >
                        {statusLabels[order.status] || order.status}
                      </span>
                    </td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>
                      <button
                        className="orders-detail-button"
                        onClick={() => viewOrder(order.id)}
                      >
                        Chi tiết
                      </button>

                      {order.status === "pending" && (
                        <button
                          className="orders-action-button"
                          disabled={updatingId === order.id}
                          onClick={() =>
                            updateStatus(order, "processing")
                          }
                        >
                          Xử lý
                        </button>
                      )}

                      {order.status === "processing" && (
                        <button
                          className="orders-action-button"
                          disabled={updatingId === order.id}
                          onClick={() =>
                            updateStatus(order, "completed")
                          }
                        >
                          Hoàn thành
                        </button>
                      )}

                      {["pending", "processing"].includes(order.status) && (
                        <button
                          className="orders-cancel-button"
                          disabled={updatingId === order.id}
                          onClick={() =>
                            updateStatus(order, "cancelled")
                          }
                        >
                          Hủy
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedOrder && (
        <div
          className="order-detail-overlay"
          onClick={() => setSelectedOrder(null)}
        >
          <section
            className="order-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-detail-heading">
              <div>
                <p className="orders-eyebrow">CHI TIẾT ĐƠN HÀNG</p>
                <h2>Đơn hàng #{selectedOrder.id}</h2>
              </div>

              <button
                className="orders-close-button"
                onClick={() => setSelectedOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className="order-customer-info">
              <p>
                <strong>Khách hàng:</strong>{" "}
                {selectedOrder.customer_name}
              </p>
              <p>
                <strong>Số điện thoại:</strong> {selectedOrder.phone}
              </p>
              <p>
                <strong>Địa chỉ:</strong> {selectedOrder.address}
              </p>
              <p>
                <strong>Ngày đặt:</strong>{" "}
                {formatDate(selectedOrder.created_at)}
              </p>
              <p>
                <strong>Trạng thái:</strong>{" "}
                {statusLabels[selectedOrder.status] ||
                  selectedOrder.status}
              </p>
            </div>

            <h3>Sản phẩm trong đơn</h3>

            <div className="order-detail-items">
              {selectedOrder.items?.map((item, index) => (
                <div className="order-detail-item" key={index}>
                  <div>
                    <strong>{item.product_name}</strong>
                    <p>
                      {formatPrice(item.unit_price)} × {item.quantity}
                    </p>
                  </div>

                  <strong>{formatPrice(item.subtotal)}</strong>
                </div>
              ))}
            </div>

            <div className="order-detail-total">
              <span>Tổng thanh toán</span>
              <strong>{formatPrice(selectedOrder.total_amount)}</strong>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminOrders;
