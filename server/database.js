import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// DATABASE CONNECTION
// ========================================

const db = new Database(
  path.join(__dirname, "techshop.db")
);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// ========================================
// CREATE TABLES
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price INTEGER NOT NULL CHECK (price >= 0),
    image TEXT DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer'
      CHECK (role IN ('admin', 'customer')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    total_amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

// ========================================
// DATABASE MIGRATION
// Bổ sung role cho database cũ
// ========================================

const userColumns = db.prepare(`
  PRAGMA table_info(users)
`).all();

const hasRoleColumn = userColumns.some(
  (column) => column.name === "role"
);

if (!hasRoleColumn) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('admin', 'customer'))
  `);

  console.log(
    "Đã bổ sung cột role cho bảng users."
  );
}

// ========================================
// SEED INITIAL PRODUCTS
// Tạo 3 sản phẩm nổi bật nếu database chưa có
// ========================================

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (name)
  VALUES (?)
`);

const insertProduct = db.prepare(`
  INSERT INTO products (
    name,
    description,
    price,
    image,
    stock,
    category_id
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const seedProducts = db.transaction(() => {
  // Tạo danh mục Phụ kiện nếu chưa có
  insertCategory.run("Phụ kiện");

  const category = db.prepare(`
    SELECT id
    FROM categories
    WHERE name = ?
  `).get("Phụ kiện");

  // Kiểm tra số lượng sản phẩm hiện tại
  const productCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM products
  `).get().total;

  // Nếu database chưa có sản phẩm thì tạo 3 sản phẩm nổi bật
  if (productCount === 0) {
    insertProduct.run(
      "Tai nghe Bluetooth",
      "Tai nghe không dây tiện dụng.",
      590000,
      "https://placehold.co/400x300?text=Headphones",
      20,
      category.id
    );

    insertProduct.run(
      "Bàn phím cơ",
      "Bàn phím cơ dành cho làm việc và chơi game.",
      890000,
      "https://placehold.co/400x300?text=Keyboard",
      15,
      category.id
    );

    insertProduct.run(
      "Chuột không dây",
      "Chuột không dây nhỏ gọn.",
      350000,
      "https://placehold.co/400x300?text=Mouse",
      30,
      category.id
    );

    console.log("Đã tạo 3 sản phẩm nổi bật mẫu.");
  }

  // ========================================
  // ADDITIONAL PRODUCTS
  // Bổ sung 3 sản phẩm thường
  // ========================================

  const additionalProducts = [
    {
      name: "Loa Bluetooth mini",
      description:
        "Loa Bluetooth mini nhỏ gọn, âm thanh tiện dụng.",
      price: 350000,
      image:
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSo2RJnRHdjTfHV4IWQBiH9Tf4-r6DCffsPcO_ybRCrqs76T8Fm8nGHOpII&s=10",
      stock: 20,
    },
    {
      name: "Củ sạc nhanh USB-C",
      description:
        "Củ sạc nhanh USB-C nhỏ gọn, tiện lợi.",
      price: 250000,
      image:
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsK7yzC8hbOXdZD2XP_x69urG_MkoMMdUcvjr2hL5C62mgWlgarITCOgY&s=10",
      stock: 25,
    },
    {
      name: "Giá đỡ điện thoại",
      description:
        "Giá đỡ điện thoại để bàn, thuận tiện khi sử dụng.",
      price: 120000,
      image:
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSL29DNT0kC4AF0KvTVIHZJW_32wQtnmuQA1z5R0brvMQKE_9k5uqhMIEK&s=10",
      stock: 30,
    },
  ];

  // Tìm sản phẩm theo tên để tránh tạo trùng
  const findProductByName = db.prepare(`
    SELECT id
    FROM products
    WHERE name = ?
  `);

  for (const product of additionalProducts) {
    const existingProduct = findProductByName.get(
      product.name
    );

    // Chỉ thêm nếu sản phẩm chưa tồn tại
    if (!existingProduct) {
      insertProduct.run(
        product.name,
        product.description,
        product.price,
        product.image,
        product.stock,
        category.id
      );

      console.log(
        `Đã thêm sản phẩm: ${product.name}`
      );
    }
  }

  console.log(
    "Đã kiểm tra và bổ sung sản phẩm thường."
  );
});

// Chạy tạo dữ liệu mẫu
seedProducts();

// ========================================
// EXPORT DATABASE
// ========================================

export default db;

console.log("TechShop database đã sẵn sàng.");
