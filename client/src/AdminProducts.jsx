import { useCallback, useEffect, useMemo, useState } from "react";
import "./AdminProducts.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  image: "",
  stock: "0",
  category: "Phụ kiện",
};

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

function formatPrice(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

async function parseResponse(response, onUnauthorized) {
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (typeof onUnauthorized === "function") {
      onUnauthorized();
    }
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  if (response.status === 403) {
    throw new Error("Bạn không có quyền thực hiện thao tác này.");
  }

  if (!response.ok) {
    throw new Error(
      data.message || `Yêu cầu thất bại (${response.status})`
    );
  }

  return data;
}

function getAuthHeaders(includeJson = false) {
  const token = sessionStorage.getItem("techshop_token");
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getStockStatus(stock) {
  const quantity = Number(stock || 0);

  if (quantity <= 0) {
    return { label: "Hết hàng", className: "stock-out" };
  }

  if (quantity <= 5) {
    return { label: "Sắp hết", className: "stock-low" };
  }

  return { label: "Còn hàng", className: "stock-available" };
}

export default function AdminProducts({ onBack, onUnauthorized }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/products`);
      const data = await parseResponse(response, onUnauthorized);

      if (!Array.isArray(data)) {
        throw new Error("Dữ liệu sản phẩm không đúng định dạng.");
      }

      setProducts(data);
    } catch (err) {
      setError(err.message || "Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const categories = useMemo(() => {
    return [
      ...new Set(
        products
          .map((product) => product.category)
          .filter((category) => typeof category === "string" && category.trim())
      ),
    ].sort((a, b) => a.localeCompare(b, "vi"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");

    return products.filter((product) => {
      const matchesSearch =
        !keyword ||
        String(product.id).includes(keyword) ||
        String(product.name || "")
          .toLocaleLowerCase("vi")
          .includes(keyword);

      const matchesCategory =
        categoryFilter === "all" ||
        product.category === categoryFilter;

      const stock = Number(product.stock || 0);

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "out" && stock <= 0) ||
        (stockFilter === "low" && stock > 0 && stock <= 5) ||
        (stockFilter === "available" && stock > 5);

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / pageSize)
  );

  const safePage = Math.min(page, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;

    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, safePage, pageSize]);

  const totalStock = products.reduce(
    (sum, product) => sum + Number(product.stock || 0),
    0
  );

  const outOfStock = products.filter(
    (product) => Number(product.stock || 0) <= 0
  ).length;

  const lowStock = products.filter((product) => {
    const stock = Number(product.stock || 0);
    return stock > 0 && stock <= 5;
  }).length;

  function openAddForm() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(product) {
    setEditingProduct(product);
    setForm({
      name: product.name || "",
      description: product.description || "",
      price: String(product.price ?? ""),
      image: product.image || "",
      stock: String(product.stock ?? 0),
      category: product.category || "Phụ kiện",
    });

    setError("");
    setMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    const name = form.name.trim();
    const category = form.category.trim();
    const price = Number(form.price);
    const stock = Number(form.stock);

    if (!name) {
      setError("Vui lòng nhập tên sản phẩm.");
      return;
    }

    if (name.length > 200) {
      setError("Tên sản phẩm không được vượt quá 200 ký tự.");
      return;
    }

    if (!category) {
      setError("Vui lòng nhập danh mục sản phẩm.");
      return;
    }

    if (!Number.isSafeInteger(price) || price < 0) {
      setError("Giá phải là số nguyên không âm.");
      return;
    }

    if (!Number.isSafeInteger(stock) || stock < 0) {
      setError("Tồn kho phải là số nguyên không âm.");
      return;
    }

    if (form.description.length > 2000) {
      setError("Mô tả không được vượt quá 2.000 ký tự.");
      return;
    }

    if (form.image.trim()) {
      try {
        const imageUrl = new URL(form.image.trim());

        if (!["http:", "https:"].includes(imageUrl.protocol)) {
          throw new Error("URL không hợp lệ");
        }
      } catch {
        setError("Đường dẫn ảnh phải là URL http hoặc https hợp lệ.");
        return;
      }
    }

    const payload = {
      name,
      description: form.description.trim(),
      price,
      image: form.image.trim(),
      stock,
      category,
    };

    try {
      setSaving(true);

      const isEditing = Boolean(editingProduct);

      const url = isEditing
        ? `${API_URL}/products/${editingProduct.id}`
        : `${API_URL}/products`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });

      await parseResponse(response, onUnauthorized);

      setShowForm(false);
      setEditingProduct(null);
      setForm(EMPTY_FORM);

      setMessage(
        isEditing
          ? "Cập nhật sản phẩm thành công."
          : "Thêm sản phẩm thành công."
      );

      await loadProducts();
    } catch (err) {
      setError(err.message || "Không thể lưu sản phẩm.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product) {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa sản phẩm "${product.name}" (ID: ${product.id}) không?\n\nThao tác này không thể hoàn tác.`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setDeletingId(product.id);

    try {
      const response = await fetch(
        `${API_URL}/products/${product.id}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      await parseResponse(response, onUnauthorized);

      setMessage(`Đã xóa sản phẩm "${product.name}".`);
      await loadProducts();
    } catch (err) {
      setError(
        err.message ||
          "Không thể xóa sản phẩm. Có thể sản phẩm đã được sử dụng trong đơn hàng."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setCategoryFilter("all");
    setStockFilter("all");
    setPage(1);
  }

  const firstItem =
    filteredProducts.length === 0
      ? 0
      : (safePage - 1) * pageSize + 1;

  const lastItem = Math.min(
    safePage * pageSize,
    filteredProducts.length
  );

  return (
    <main className="admin-products-page">
      {/* HEADER */}
      <header className="ap-header">
        <div className="ap-heading">
          <div className="ap-logo">DH</div>

          <div>
            <p className="ap-eyebrow">DUYHSHOP ADMIN</p>
            <h1>Quản lý sản phẩm</h1>
            <p className="ap-subtitle">
              Quản lý danh mục, giá bán và tồn kho
            </p>
          </div>
        </div>

        <div className="ap-header-actions">
          <button
            className="ap-btn ap-btn-secondary"
            type="button"
            onClick={onBack}
          >
            ← Quay lại cửa hàng
          </button>

          <button
            className="ap-btn ap-btn-secondary"
            type="button"
            onClick={loadProducts}
            disabled={loading}
          >
            {loading ? "Đang tải..." : "↻ Làm mới"}
          </button>

          <button
            className="ap-btn ap-btn-primary"
            type="button"
            onClick={openAddForm}
          >
            + Thêm sản phẩm
          </button>
        </div>
      </header>

      {/* THÔNG BÁO */}
      {error && (
        <div className="ap-alert ap-alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Đóng thông báo lỗi"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}

      {message && (
        <div className="ap-alert ap-alert-success" role="status">
          <span>{message}</span>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}

      {/* THỐNG KÊ */}
      <section className="ap-stats">
        <article className="ap-stat-card">
          <span>Tổng sản phẩm</span>
          <strong>{products.length.toLocaleString("vi-VN")}</strong>
          <small>Sản phẩm trong hệ thống</small>
        </article>

        <article className="ap-stat-card">
          <span>Tổng tồn kho</span>
          <strong>{totalStock.toLocaleString("vi-VN")}</strong>
          <small>Tổng số lượng sản phẩm</small>
        </article>

        <article className="ap-stat-card ap-stat-warning">
          <span>Sắp hết hàng</span>
          <strong>{lowStock.toLocaleString("vi-VN")}</strong>
          <small>Tồn kho từ 1 đến 5</small>
        </article>

        <article className="ap-stat-card ap-stat-danger">
          <span>Hết hàng</span>
          <strong>{outOfStock.toLocaleString("vi-VN")}</strong>
          <small>Tồn kho bằng 0</small>
        </article>
      </section>

      {/* BỘ LỌC */}
      <section className="ap-toolbar">
        <div className="ap-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Tìm theo tên hoặc mã sản phẩm..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Tìm kiếm sản phẩm"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo danh mục"
        >
          <option value="all">Tất cả danh mục</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          value={stockFilter}
          onChange={(event) => {
            setStockFilter(event.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo tồn kho"
        >
          <option value="all">Tất cả tồn kho</option>
          <option value="available">Còn hàng</option>
          <option value="low">Sắp hết (1–5)</option>
          <option value="out">Hết hàng</option>
        </select>

        <button
          className="ap-btn ap-btn-secondary"
          type="button"
          onClick={resetFilters}
        >
          Xóa bộ lọc
        </button>
      </section>

      {/* BẢNG SẢN PHẨM */}
      <section className="ap-table-card">
        <div className="ap-table-heading">
          <div>
            <h2>Danh sách sản phẩm</h2>
            <p>
              Tìm thấy {filteredProducts.length.toLocaleString("vi-VN")}{" "}
              sản phẩm
            </p>
          </div>

          <label className="ap-page-size">
            Hiển thị
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            / trang
          </label>
        </div>

        {loading ? (
          <div className="ap-empty-state">Đang tải danh sách sản phẩm...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="ap-empty-state">
            <strong>Không tìm thấy sản phẩm</strong>
            <p>Thử thay đổi từ khóa hoặc bộ lọc.</p>
            <button
              type="button"
              className="ap-btn ap-btn-secondary"
              onClick={resetFilters}
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <>
            <div className="ap-table-wrapper">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Danh mục</th>
                    <th>Giá bán</th>
                    <th>Tồn kho</th>
                    <th>Trạng thái</th>
                    <th className="ap-actions-column">Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedProducts.map((product) => {
                    const stockStatus = getStockStatus(product.stock);

                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="ap-product-cell">
                            {product.image ? (
                              <img
                                className="ap-product-image"
                                src={product.image}
                                alt={product.name}
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="ap-image-placeholder">
                                IMG
                              </div>
                            )}

                            <div className="ap-product-info">
                              <strong>{product.name}</strong>
                              <span>ID: {product.id}</span>
                              {product.description && (
                                <small>{product.description}</small>
                              )}
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="ap-category">
                            {product.category || "Chưa phân loại"}
                          </span>
                        </td>

                        <td className="ap-price">
                          {formatPrice(product.price)}
                        </td>

                        <td>
                          <strong>
                            {Number(product.stock || 0).toLocaleString("vi-VN")}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`ap-stock-badge ${stockStatus.className}`}
                          >
                            {stockStatus.label}
                          </span>
                        </td>

                        <td>
                          <div className="ap-row-actions">
                            <button
                              className="ap-action-edit"
                              type="button"
                              onClick={() => openEditForm(product)}
                            >
                              Sửa
                            </button>

                            <button
                              className="ap-action-delete"
                              type="button"
                              disabled={deletingId === product.id}
                              onClick={() => handleDelete(product)}
                            >
                              {deletingId === product.id
                                ? "Đang xóa..."
                                : "Xóa"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PHÂN TRANG */}
            <div className="ap-pagination">
              <span>
                Hiển thị {firstItem}–{lastItem} /{" "}
                {filteredProducts.length} sản phẩm
              </span>

              <div className="ap-pagination-buttons">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  aria-label="Trang đầu"
                >
                  «
                </button>

                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Trước
                </button>

                <span>
                  Trang {safePage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Sau
                </button>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  aria-label="Trang cuối"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* FORM THÊM / SỬA */}
      {showForm && (
        <div
          className="ap-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <section
            className="ap-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ap-form-title"
          >
            <div className="ap-modal-heading">
              <div>
                <p className="ap-eyebrow">DUYHSHOP ADMIN</p>
                <h2 id="ap-form-title">
                  {editingProduct ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}
                </h2>
              </div>

              <button
                className="ap-modal-close"
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Đóng biểu mẫu"
              >
                ×
              </button>
            </div>

            <form className="ap-form" onSubmit={handleSubmit}>
              <label>
                Tên sản phẩm <span>*</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  maxLength={200}
                  required
                  autoFocus
                  placeholder="Ví dụ: Tai nghe Bluetooth"
                />
              </label>

              <div className="ap-form-grid">
                <label>
                  Giá bán (VND) <span>*</span>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={handleFormChange}
                    required
                    placeholder="590000"
                  />
                </label>

                <label>
                  Số lượng tồn kho <span>*</span>
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </div>

              <label>
                Danh mục <span>*</span>
                <input
                  name="category"
                  list="ap-category-options"
                  value={form.category}
                  onChange={handleFormChange}
                  maxLength={100}
                  required
                  placeholder="Ví dụ: Phụ kiện"
                />
                <datalist id="ap-category-options">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <small>
                  Chọn danh mục có sẵn hoặc nhập tên danh mục mới.
                </small>
              </label>

              <label>
                Đường dẫn hình ảnh
                <input
                  name="image"
                  type="url"
                  value={form.image}
                  onChange={handleFormChange}
                  placeholder="https://example.com/image.jpg"
                />
              </label>

              {form.image.trim() && (
                <div className="ap-image-preview">
                  <span>Xem trước hình ảnh</span>
                  <img
                    src={form.image}
                    alt="Xem trước sản phẩm"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                    onLoad={(event) => {
                      event.currentTarget.style.display = "block";
                    }}
                  />
                </div>
              )}

              <label>
                Mô tả sản phẩm
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  maxLength={2000}
                  rows={4}
                  placeholder="Nhập mô tả sản phẩm..."
                />
                <small>{form.description.length}/2000 ký tự</small>
              </label>

              <div className="ap-form-actions">
                <button
                  className="ap-btn ap-btn-secondary"
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Hủy
                </button>

                <button
                  className="ap-btn ap-btn-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Đang lưu..."
                    : editingProduct
                      ? "Lưu thay đổi"
                      : "Thêm sản phẩm"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
