import { useCallback, useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import "./AdminDashboard.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const INITIAL_SUMMARY = {
  total_products: 0,
  total_stock: 0,
  out_of_stock: 0,
  total_orders: 0,
  pending_orders: 0,
  processing_orders: 0,
  completed_orders: 0,
  cancelled_orders: 0,
  total_revenue: 0,
  revenue_today: 0,
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const parts = String(dateString).slice(0, 10).split("-");

  if (parts.length !== 3) return dateString;

  const [year, month, day] = parts;

  return `${day}/${month}/${year}`;
}

async function fetchJson(url, signal, onUnauthorized) {
  const token = sessionStorage.getItem("techshop_token");

  const response = await fetch(url, {
    signal,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401) {
    sessionStorage.removeItem("techshop_token");
    onUnauthorized?.();
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  if (response.status === 403) {
    throw new Error("Bạn không có quyền truy cập dữ liệu Dashboard.");
  }

  if (!response.ok) {
    throw new Error(
      `Không thể tải dữ liệu (${response.status}): ${url}`
    );
  }

  return response.json();
}

export default function AdminDashboard({ onBack, onUnauthorized }) {
  const [summary, setSummary] = useState(INITIAL_SUMMARY);
  const [revenue, setRevenue] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async (signal) => {
    setLoading(true);
    setError("");

    try {
      const [summaryData, revenueData, productsData] =
        await Promise.all([
          fetchJson(`${API_URL}/dashboard/summary`, signal, onUnauthorized),
          fetchJson(`${API_URL}/dashboard/revenue`, signal, onUnauthorized),
          fetchJson(`${API_URL}/dashboard/top-products`, signal, onUnauthorized),
        ]);

      if (
        !summaryData ||
        !Array.isArray(revenueData) ||
        !Array.isArray(productsData)
      ) {
        throw new Error(
          "Dữ liệu Dashboard trả về không đúng định dạng."
        );
      }

      setSummary({
        ...INITIAL_SUMMARY,
        ...summaryData,
      });

      setRevenue(revenueData);
      setTopProducts(productsData);
      setLastUpdated(new Date());
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Dashboard error:", err);
        setError(
          err.message || "Không thể tải dữ liệu Dashboard."
        );
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [onUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();

    loadDashboard(controller.signal);

    return () => controller.abort();
  }, [loadDashboard]);

  function handleRefresh() {
    loadDashboard();
  }

  const revenueChartData = {
    labels: revenue.map((item) => formatDate(item.date)),
    datasets: [
      {
        label: "Doanh thu",
        data: revenue.map((item) => Number(item.revenue || 0)),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.12)",
        pointBackgroundColor: "#2563eb",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const revenueChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) =>
            `Doanh thu: ${formatCurrency(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => {
            const amount = Number(value);

            if (amount >= 1000000) {
              return `${(amount / 1000000).toLocaleString(
                "vi-VN",
                { maximumFractionDigits: 1 }
              )} tr`;
            }

            if (amount >= 1000) {
              return `${(amount / 1000).toLocaleString(
                "vi-VN",
                { maximumFractionDigits: 0 }
              )} k`;
            }

            return amount;
          },
        },
      },
    },
  };

  const topProductsChartData = {
    labels: topProducts.map((item) => item.name),
    datasets: [
      {
        label: "Số lượng đã bán",
        data: topProducts.map((item) =>
          Number(item.total_sold || 0)
        ),
        backgroundColor: "#16a34a",
        borderRadius: 6,
        maxBarThickness: 42,
      },
    ],
  };

  const topProductsChartOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) =>
            `Đã bán: ${formatNumber(context.parsed.x)} sản phẩm`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
      },
      y: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <main className="admin-dashboard">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <div className="dashboard-logo">DH</div>

          <div>
            <p className="dashboard-eyebrow">DUYHSHOP ADMIN</p>
            <h1>Dashboard quản trị</h1>
            <p className="dashboard-subtitle">
              Tổng quan hoạt động cửa hàng
            </p>
          </div>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="dashboard-button dashboard-button-secondary"
            onClick={onBack}
          >
            ← Quay lại cửa hàng
          </button>

          <button
            type="button"
            className="dashboard-button dashboard-button-primary"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "Đang tải..." : "↻ Làm mới"}
          </button>
        </div>
      </header>

      {/* TRẠNG THÁI */}
      <section className="dashboard-status-row">
        <p>
          {lastUpdated
            ? `Cập nhật lần cuối: ${lastUpdated.toLocaleTimeString(
                "vi-VN"
              )}`
            : "Chưa có dữ liệu cập nhật"}
        </p>

        {loading && (
          <span className="dashboard-loading">
            Đang tải dữ liệu...
          </span>
        )}
      </section>

      {error && (
        <section className="dashboard-error" role="alert">
          <div>
            <strong>Không thể tải đầy đủ dữ liệu Dashboard.</strong>
            <p>{error}</p>
            <small>
              Kiểm tra backend và các API Dashboard rồi thử tải lại.
            </small>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
          >
            Thử lại
          </button>
        </section>
      )}

      {/* THỐNG KÊ */}
      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <h2>Tổng quan</h2>
            <p>Các chỉ số chính của cửa hàng</p>
          </div>
        </div>

        <div className="dashboard-stat-grid">
          <article className="dashboard-stat-card stat-blue">
            <div className="stat-card-top">
              <span>Tổng sản phẩm</span>
              <span className="stat-icon">▦</span>
            </div>
            <strong>{formatNumber(summary.total_products)}</strong>
            <small>Sản phẩm trong danh mục</small>
          </article>

          <article className="dashboard-stat-card stat-green">
            <div className="stat-card-top">
              <span>Tồn kho</span>
              <span className="stat-icon">□</span>
            </div>
            <strong>{formatNumber(summary.total_stock)}</strong>
            <small>
              {formatNumber(summary.out_of_stock)} sản phẩm hết hàng
            </small>
          </article>

          <article className="dashboard-stat-card stat-purple">
            <div className="stat-card-top">
              <span>Tổng đơn hàng</span>
              <span className="stat-icon">▤</span>
            </div>
            <strong>{formatNumber(summary.total_orders)}</strong>
            <small>
              {formatNumber(summary.pending_orders)} đơn đang chờ xử lý
            </small>
          </article>

          <article className="dashboard-stat-card stat-orange">
            <div className="stat-card-top">
              <span>Doanh thu hôm nay</span>
              <span className="stat-icon">₫</span>
            </div>
            <strong className="stat-money">
              {formatCurrency(summary.revenue_today)}
            </strong>
            <small>Theo dữ liệu API Dashboard</small>
          </article>
        </div>
      </section>

      {/* DOANH THU */}
      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <h2>Doanh thu</h2>
            <p>Diễn biến doanh thu trong 7 ngày gần nhất</p>
          </div>

          <div className="dashboard-revenue-total">
            <span>Tổng doanh thu</span>
            <strong>{formatCurrency(summary.total_revenue)}</strong>
          </div>
        </div>

        <article className="dashboard-panel">
          {revenue.length > 0 ? (
            <div className="dashboard-chart revenue-chart">
              <Line
                data={revenueChartData}
                options={revenueChartOptions}
              />
            </div>
          ) : (
            <div className="dashboard-empty">
              {loading
                ? "Đang tải biểu đồ..."
                : "Chưa có dữ liệu doanh thu."}
            </div>
          )}
        </article>
      </section>

      {/* TRẠNG THÁI ĐƠN HÀNG */}
      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <h2>Tình trạng đơn hàng</h2>
            <p>Phân bố đơn hàng theo trạng thái</p>
          </div>
        </div>

        <div className="dashboard-order-grid">
          <article className="dashboard-order-card order-pending">
            <span>Chờ xử lý</span>
            <strong>{formatNumber(summary.pending_orders)}</strong>
          </article>

          <article className="dashboard-order-card order-processing">
            <span>Đang xử lý</span>
            <strong>{formatNumber(summary.processing_orders)}</strong>
          </article>

          <article className="dashboard-order-card order-completed">
            <span>Hoàn thành</span>
            <strong>{formatNumber(summary.completed_orders)}</strong>
          </article>

          <article className="dashboard-order-card order-cancelled">
            <span>Đã hủy</span>
            <strong>{formatNumber(summary.cancelled_orders)}</strong>
          </article>
        </div>
      </section>

      {/* SẢN PHẨM BÁN CHẠY */}
      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <h2>Sản phẩm bán chạy</h2>
            <p>
              Số lượng bán và doanh thu theo dữ liệu API
            </p>
          </div>
        </div>

        <div className="dashboard-products-grid">
          <article className="dashboard-panel">
            <h3>Số lượng sản phẩm đã bán</h3>

            {topProducts.length > 0 ? (
              <div className="dashboard-chart products-chart">
                <Bar
                  data={topProductsChartData}
                  options={topProductsChartOptions}
                />
              </div>
            ) : (
              <div className="dashboard-empty">
                {loading
                  ? "Đang tải biểu đồ..."
                  : "Chưa có dữ liệu sản phẩm bán chạy."}
              </div>
            )}
          </article>

          <article className="dashboard-panel">
            <h3>Bảng xếp hạng sản phẩm</h3>

            {topProducts.length > 0 ? (
              <div className="dashboard-table-wrapper">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Đã bán</th>
                      <th>Doanh thu</th>
                    </tr>
                  </thead>

                  <tbody>
                    {topProducts.map((product, index) => (
                      <tr key={`${product.name}-${index}`}>
                        <td>
                          <div className="dashboard-product-name">
                            <span className="product-rank">
                              {index + 1}
                            </span>
                            <strong>{product.name}</strong>
                          </div>
                        </td>
                        <td>{formatNumber(product.total_sold)}</td>
                        <td>
                          {formatCurrency(product.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dashboard-empty">
                {loading
                  ? "Đang tải bảng..."
                  : "Chưa có sản phẩm để hiển thị."}
              </div>
            )}
          </article>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="dashboard-footer">
        <span>DuyHshop Admin</span>
        <span>Dashboard thống kê cửa hàng</span>
      </footer>
    </main>
  );
}
