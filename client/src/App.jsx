import { useEffect, useState } from "react";
import "./App.css";
import AdminProducts from "./AdminProducts";
import AdminOrders from "./AdminOrders";
import AdminDashboard from "./AdminDashboard";
import Login from "./Login";
import MyOrders from "./MyOrders";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function formatPrice(price) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price || 0);
}

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Trạng thái các trang quản trị
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOrders, setIsOrders] = useState(false);
  const [isDashboard, setIsDashboard] = useState(false);
  const [isMyOrders, setIsMyOrders] = useState(false);

  // Xác thực tài khoản quản trị
  const [adminUser, setAdminUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  // Trạng thái giỏ hàng
  const [showCart, setShowCart] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Thông tin giao hàng
  const [customer, setCustomer] = useState({
    customerName: "",
    phone: "",
    address: "",
  });

  // ========================================
  // LẤY DANH SÁCH SẢN PHẨM
  // ========================================
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      try {
        setLoading(true);

        const response = await fetch(`${API_URL}/products`);

        if (!response.ok) {
          throw new Error("Không thể tải sản phẩm.");
        }

        const data = await response.json();

        if (!cancelled) {
          setProducts(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Không thể kết nối máy chủ.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  // ========================================
  // KIỂM TRA TOKEN KHI MỞ / TẢI LẠI WEBSITE
  // ========================================
  useEffect(() => {
    let cancelled = false;

    async function verifyUserSession() {
      const token = sessionStorage.getItem("techshop_token");

      if (!token) {
        if (!cancelled) setAuthChecking(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !["admin", "customer"].includes(data.user?.role)) {
          sessionStorage.removeItem("techshop_token");
          if (!cancelled) setAdminUser(null);
          return;
        }

        if (!cancelled) setAdminUser(data.user);
      } catch {
        // Nếu máy chủ tạm thời không kết nối được, giữ token để thử lại
        // ở lần tải trang sau; không cấp quyền admin khi chưa xác minh.
        if (!cancelled) setAdminUser(null);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }

    verifyUserSession();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAdminLogin(user) {
    setAdminUser(user);
    setShowLogin(false);
    setError("");
    setMessage("");
  }

  function handleAdminLogout() {
    sessionStorage.removeItem("techshop_token");
    setAdminUser(null);
    setIsAdmin(false);
    setIsOrders(false);
    setIsDashboard(false);
    setIsMyOrders(false);
    setShowLogin(false);
    setError("");
    setMessage("");
  }

  // ========================================
  // BẢO VỆ CÁC TRANG QUẢN TRỊ
  // ========================================
  if (authChecking) {
    return (
      <div className="app">
        <main style={{ padding: "48px 20px", textAlign: "center" }}>
          Đang kiểm tra phiên đăng nhập...
        </main>
      </div>
    );
  }

  if (showLogin) {
    return (
      <Login
        onLogin={handleAdminLogin}
        onClose={() => setShowLogin(false)}
      />
    );
  }

  if (
    (isDashboard || isOrders || isAdmin) &&
    adminUser?.role !== "admin"
  ) {
    return (
      <Login
        onLogin={handleAdminLogin}
        onClose={() => {
          setIsDashboard(false);
          setIsOrders(false);
          setIsAdmin(false);
          setShowLogin(false);
        }}
      />
    );
  }

  // ========================================
  // CHUYỂN TRANG QUẢN TRỊ
  // ========================================
  if (isDashboard) {
    return (
      <AdminDashboard
        onBack={() => setIsDashboard(false)}
        onUnauthorized={handleAdminLogout}
      />
    );
  }

  if (isOrders) {
    return (
      <AdminOrders
        onBack={() => {
          setIsOrders(false);
          setError("");
        }}
        onUnauthorized={handleAdminLogout}
      />
    );
  }

  if (isAdmin) {
    return (
      <AdminProducts
        onBack={() => {
          setIsAdmin(false);
          setError("");
        }}
        onUnauthorized={handleAdminLogout}
      />
    );
  }

  if (isMyOrders && adminUser?.role === "customer") {
    return (
      <MyOrders
        onBack={() => setIsMyOrders(false)}
        onUnauthorized={handleAdminLogout}
      />
    );
  }

  // ========================================
  // TÍNH SỐ LƯỢNG VÀ TỔNG TIỀN GIỎ HÀNG
  // ========================================
  const cartCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // ========================================
  // THÊM SẢN PHẨM VÀO GIỎ HÀNG
  // ========================================
  function addToCart(product) {
    setMessage("");
    setError("");

    if (product.stock <= 0) {
      setError("Sản phẩm này hiện đã hết hàng.");
      return;
    }

    const existing = cart.find(
      (item) => item.id === product.id
    );

    if (existing) {
      if (existing.quantity >= product.stock) {
        setError("Số lượng đã đạt giới hạn tồn kho.");
        return;
      }

      setCart((current) =>
        current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );

      return;
    }

    setCart((current) => [
      ...current,
      { ...product, quantity: 1 },
    ]);
  }

  // ========================================
  // THAY ĐỔI SỐ LƯỢNG SẢN PHẨM
  // ========================================
  function changeQuantity(productId, amount) {
    setError("");

    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== productId) {
            return item;
          }

          const product = products.find(
            (p) => p.id === productId
          );

          const maxStock = product?.stock ?? item.stock;

          const quantity = Math.min(
            maxStock,
            item.quantity + amount
          );

          return {
            ...item,
            quantity,
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  // ========================================
  // XÓA SẢN PHẨM KHỎI GIỎ HÀNG
  // ========================================
  function removeFromCart(productId) {
    setCart((current) =>
      current.filter((item) => item.id !== productId)
    );

    setError("");
  }

  // ========================================
  // ĐẶT HÀNG
  // ========================================
  async function placeOrder(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (cart.length === 0) {
      setError("Giỏ hàng đang trống.");
      return;
    }

    if (adminUser?.role !== "customer") {
      setError(
        adminUser?.role === "admin"
          ? "Tài khoản Admin không thể đặt hàng. Vui lòng dùng tài khoản khách hàng."
          : "Vui lòng đăng nhập tài khoản khách hàng trước khi đặt hàng."
      );
      return;
    }

    if (
      !customer.customerName.trim() ||
      !customer.phone.trim() ||
      !customer.address.trim()
    ) {
      setError("Vui lòng nhập đầy đủ thông tin giao hàng.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("techshop_token") || ""}`,
        },
        body: JSON.stringify({
          customer_name: customer.customerName.trim(),
          phone: customer.phone.trim(),
          address: customer.address.trim(),
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Đặt hàng thất bại."
        );
      }

      // Xóa giỏ hàng sau khi đặt thành công
      setCart([]);

      setCustomer({
        customerName: "",
        phone: "",
        address: "",
      });

      setCheckout(false);
      setShowCart(false);

      const orderId = data.order?.id ?? data.orderId;
      const orderTotal = data.order?.total_amount ?? data.totalAmount;

      setMessage(
        `Đặt hàng thành công! Mã đơn hàng: #${orderId}. Tổng tiền: ${formatPrice(orderTotal)}`
      );

      // Cập nhật lại tồn kho
      const productResponse = await fetch(
        `${API_URL}/products`
      );

      if (productResponse.ok) {
        const updatedProducts = await productResponse.json();
        setProducts(updatedProducts);
      }
    } catch (err) {
      setError(err.message || "Đặt hàng thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  // ========================================
  // GIAO DIỆN TRANG CHỦ
  // ========================================
  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <a className="logo" href="/">
          DuyHshop
        </a>

        <nav>
          <a href="/">Trang chủ</a>
          <a href="#products">Sản phẩm</a>
          <a href="#contact">Liên hệ</a>
        </nav>

        {/* CÁC NÚT CHỨC NĂNG */}
        <div className="header-actions">
          {/* CÁC CHỨC NĂNG QUẢN TRỊ - CHỈ HIỆN KHI ĐÃ ĐĂNG NHẬP */}
          {adminUser?.role === "admin" ? (
            <>
              <button
                className="cart-button"
                type="button"
                onClick={() => {
                  setIsDashboard(true);
                  setIsAdmin(false);
                  setIsOrders(false);
                  setError("");
                }}
              >
                Dashboard
              </button>
              <button
                className="cart-button"
                type="button"
                onClick={() => {
                  setIsAdmin(true);
                  setIsDashboard(false);
                  setIsOrders(false);
                  setError("");
                }}
              >
                Quản lý sản phẩm
              </button>
              <button
                className="cart-button"
                type="button"
                onClick={() => {
                  setIsOrders(true);
                  setIsAdmin(false);
                  setIsDashboard(false);
                  setError("");
                }}
              >
                Quản lý đơn hàng
              </button>
              <button
                className="cart-button"
                type="button"
                onClick={handleAdminLogout}
              >
                Đăng xuất ({adminUser.full_name || adminUser.email})
              </button>
            </>
          ) : adminUser?.role === "customer" ? (
            <>
              <button
                className="cart-button"
                type="button"
                onClick={() => setIsMyOrders(true)}
              >
                Đơn hàng của tôi
              </button>
              <button
                className="cart-button"
                type="button"
                onClick={handleAdminLogout}
              >
                Đăng xuất ({adminUser.full_name || adminUser.email})
              </button>
            </>
          ) : (
            <button
              className="cart-button"
              type="button"
              onClick={() => {
                setShowLogin(true);
                setError("");
                setMessage("");
              }}
            >
              Đăng nhập / Đăng ký
            </button>
          )}

          {/* GIỎ HÀNG */}
          <button
            className="cart-button"
            type="button"
            onClick={() => {
              setShowCart(true);
              setCheckout(false);
              setError("");
            }}
          >
            Giỏ hàng ({cartCount})
          </button>


        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main>
        {/* BANNER */}
        <section className="hero">
          <div>
            <p className="eyebrow">
              CHÀO MỪNG ĐẾN DUYHSHOP
            </p>

            <h1>Công nghệ cho cuộc sống hiện đại</h1>

            <p>
              Khám phá phụ kiện công nghệ phù hợp
              với nhu cầu của bạn.
            </p>

            <a className="primary-button" href="#products">
              Khám phá sản phẩm
            </a>
          </div>
        </section>

        {/* DANH SÁCH SẢN PHẨM */}
        <section className="products-section" id="products">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CỬA HÀNG</p>
              <h2>Sản phẩm nổi bật</h2>
            </div>

            <span>{Math.min(products.length, 3)} sản phẩm</span>
          </div>

          {loading && <p>Đang tải sản phẩm...</p>}

          {error && !showCart && (
            <p className="error">{error}</p>
          )}

          {message && (
            <p className="order-success">{message}</p>
          )}

          {!loading && products.length === 0 && !error && (
            <p>Hiện chưa có sản phẩm nào.</p>
          )}

          <div className="product-grid">
            {products.slice(0, 3).map((product) => (
              <article
                className="product-card"
                key={product.id}
              >
                <img
                  src={product.image}
                  alt={product.name}
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />

                <div className="product-info">
                  <span className="category">
                    {product.category}
                  </span>

                  <h3>{product.name}</h3>

                  <p className="description">
                    {product.description}
                  </p>

                  <p className="stock-info">
                    {product.stock > 0
                      ? `Còn ${product.stock} sản phẩm`
                      : "Hết hàng"}
                  </p>

                  <div className="product-bottom">
                    <strong>
                      {formatPrice(product.price)}
                    </strong>

                    <button
                      type="button"
                      disabled={product.stock <= 0}
                      onClick={() => addToCart(product)}
                    >
                      {product.stock > 0
                        ? "Thêm vào giỏ"
                        : "Hết hàng"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* SẢN PHẨM ĐANG CẬP NHẬT */}
        <section className="products-section more-products-section" aria-labelledby="more-products-title">
          <div className="section-heading">
            <div>
              <h2 id="more-products-title">Sản phẩm</h2>
            </div>
          </div>

          <div className="product-grid placeholder-product-grid">
            {/* 3 sản phẩm mới đã được thêm vào database */}
            {products.map((product) => (
              <article className="product-card" key={`store-product-${product.id}`}>
                <img
                  src={product.image}
                  alt={product.name}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
                <div className="product-info">
                  <span className="category">{product.category}</span>
                  <h3>{product.name}</h3>
                  <p className="description">{product.description}</p>
                  <p className="stock-info">
                    {product.stock > 0
                      ? `Còn ${product.stock} sản phẩm`
                      : "Hết hàng"}
                  </p>
                  <div className="product-bottom">
                    <strong>{formatPrice(product.price)}</strong>
                    <button
                      type="button"
                      disabled={product.stock <= 0}
                      onClick={() => addToCart(product)}
                    >
                      {product.stock > 0 ? "Thêm vào giỏ" : "Hết hàng"}
                    </button>
                  </div>
                </div>
              </article>
            ))}

          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer id="contact">
        <p>
          © 2026 DuyHshop — Website thương mại điện tử
        </p>
      </footer>

      {/* =====================================
          GIỎ HÀNG VÀ ĐẶT HÀNG
      ===================================== */}
      {showCart && (
        <div
          className="cart-overlay"
          onClick={() => {
            if (!submitting) {
              setShowCart(false);
              setCheckout(false);
              setError("");
            }
          }}
        >
          <section
            className="cart-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Giỏ hàng và đặt hàng"
            onClick={(event) => event.stopPropagation()}
          >
            {/* TIÊU ĐỀ GIỎ HÀNG */}
            <div className="cart-heading">
              <h2>
                {checkout
                  ? "Thông tin giao hàng"
                  : "Giỏ hàng"}
              </h2>

              <button
                className="close-button"
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowCart(false);
                  setCheckout(false);
                  setError("");
                }}
              >
                Đóng ✕
              </button>
            </div>

            {error && <p className="error">{error}</p>}

            {/* NỘI DUNG GIỎ HÀNG */}
            {!checkout && (
              <>
                {cart.length === 0 ? (
                  <p>Giỏ hàng của bạn đang trống.</p>
                ) : (
                  <div className="cart-items">
                    {cart.map((item) => {
                      const currentProduct = products.find(
                        (product) => product.id === item.id
                      );

                      const maxStock =
                        currentProduct?.stock ?? item.stock;

                      return (
                        <div
                          className="cart-item"
                          key={item.id}
                        >
                          <div className="cart-item-info">
                            <strong>{item.name}</strong>

                            <span>
                              {formatPrice(item.price)}
                            </span>
                          </div>

                          <div className="quantity-controls">
                            <button
                              type="button"
                              aria-label={`Giảm số lượng ${item.name}`}
                              onClick={() =>
                                changeQuantity(item.id, -1)
                              }
                            >
                              −
                            </button>

                            <span>{item.quantity}</span>

                            <button
                              type="button"
                              aria-label={`Tăng số lượng ${item.name}`}
                              disabled={item.quantity >= maxStock}
                              onClick={() =>
                                changeQuantity(item.id, 1)
                              }
                            >
                              +
                            </button>

                            <button
                              className="remove-button"
                              type="button"
                              onClick={() =>
                                removeFromCart(item.id)
                              }
                            >
                              Xóa
                            </button>
                          </div>

                          <strong>
                            {formatPrice(
                              item.price * item.quantity
                            )}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="cart-total">
                  <span>Tổng tiền</span>
                  <strong>{formatPrice(totalAmount)}</strong>
                </div>

                <button
                  className="checkout-button"
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => {
                    if (adminUser?.role !== "customer") {
                      if (!adminUser) {
                        setShowCart(false);
                        setShowLogin(true);
                        setError("");
                      } else {
                        setError("Tài khoản Admin không thể đặt hàng. Vui lòng đăng nhập tài khoản khách hàng.");
                      }
                      return;
                    }
                    setCheckout(true);
                    setError("");
                  }}
                >
                  Tiến hành đặt hàng
                </button>
              </>
            )}

            {/* FORM THÔNG TIN GIAO HÀNG */}
            {checkout && (
              <form
                className="checkout-form"
                onSubmit={placeOrder}
              >
                <label>
                  Họ và tên
                  <input
                    required
                    type="text"
                    maxLength={100}
                    autoComplete="name"
                    value={customer.customerName}
                    onChange={(event) =>
                      setCustomer({
                        ...customer,
                        customerName: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Số điện thoại
                  <input
                    required
                    type="tel"
                    maxLength={20}
                    autoComplete="tel"
                    value={customer.phone}
                    onChange={(event) =>
                      setCustomer({
                        ...customer,
                        phone: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Địa chỉ nhận hàng
                  <textarea
                    required
                    maxLength={500}
                    rows={3}
                    autoComplete="street-address"
                    value={customer.address}
                    onChange={(event) =>
                      setCustomer({
                        ...customer,
                        address: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="cart-total">
                  <span>Tổng thanh toán</span>
                  <strong>{formatPrice(totalAmount)}</strong>
                </div>

                <button
                  className="checkout-button"
                  type="submit"
                  disabled={submitting || cart.length === 0}
                >
                  {submitting
                    ? "Đang xử lý..."
                    : "Xác nhận đặt hàng"}
                </button>

                <button
                  className="back-button"
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setCheckout(false);
                    setError("");
                  }}
                >
                  Quay lại giỏ hàng
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;