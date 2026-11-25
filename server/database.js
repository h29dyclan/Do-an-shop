
import pg from "pg";

const { Pool } = pg;

// ========================================
// DATABASE CONNECTION
// ========================================

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Thiếu DATABASE_URL. Hãy khai báo trong file .env."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Kết nối PostgreSQL trên Render qua External URL
   ssl: {
        rejectUnauthorized: false
    },

  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("connect", () => {
  console.log("Đã kết nối PostgreSQL.");
});

pool.on("error", (error) => {
  console.error("Lỗi PostgreSQL:", error);
});

// ========================================
// CREATE TABLES
// ========================================

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ========================================
    // CATEGORIES
    // ========================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE
      );
    `);

    // ========================================
    // PRODUCTS
    // ========================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price INTEGER NOT NULL CHECK (price >= 0),
        image TEXT DEFAULT '',
        stock INTEGER NOT NULL DEFAULT 0
          CHECK (stock >= 0),
        category_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_products_category
          FOREIGN KEY (category_id)
          REFERENCES categories(id)
      );
    `);

    // ========================================
    // USERS
    // ========================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,

        role VARCHAR(20) NOT NULL DEFAULT 'customer'
          CHECK (role IN ('admin', 'customer')),

        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Không cho phép hai email khác chữ hoa/thường
    // nhưng thực chất là cùng một địa chỉ.

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        idx_users_email_lower
      ON users (LOWER(email));
    `);

    // ========================================
    // ORDERS
    // ========================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        total_amount INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_orders_user
          FOREIGN KEY (user_id)
          REFERENCES users(id)
      );
    `);

    // ========================================
    // ORDER ITEMS
    // ========================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),

        CONSTRAINT fk_order_items_order
          FOREIGN KEY (order_id)
          REFERENCES orders(id),

        CONSTRAINT fk_order_items_product
          FOREIGN KEY (product_id)
          REFERENCES products(id)
      );
    `);

    // ========================================
    // INDEXES
    // ========================================

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category
      ON products(category_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_user
      ON orders(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_created
      ON orders(created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_items_order
      ON order_items(order_id);
    `);

    // ========================================
    // SEED CATEGORY
    // ========================================

    const categoryResult = await client.query(
      `
        INSERT INTO categories (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING id;
      `,
      ["Phụ kiện"]
    );

    const categoryId = categoryResult.rows[0].id;

    // ========================================
    // SEED FEATURED PRODUCTS
    // ========================================

    const productCountResult = await client.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM products;
    `);

    const productCount = productCountResult.rows[0].total;

    if (productCount === 0) {
      const featuredProducts = [
        {
          name: "Tai nghe Bluetooth",
          description: "Tai nghe không dây tiện dụng.",
          price: 590000,
          image: "https://placehold.co/400x300?text=Headphones",
          stock: 20,
        },
        {
          name: "Bàn phím cơ",
          description: "Bàn phím cơ dành cho làm việc và chơi game.",
          price: 890000,
          image: "https://placehold.co/400x300?text=Keyboard",
          stock: 15,
        },
        {
          name: "Chuột không dây",
          description: "Chuột không dây nhỏ gọn.",
          price: 350000,
          image: "https://placehold.co/400x300?text=Mouse",
          stock: 30,
        },
      ];

      for (const product of featuredProducts) {
        await client.query(
          `
            INSERT INTO products (
              name,
              description,
              price,
              image,
              stock,
              category_id
            )
            VALUES ($1, $2, $3, $4, $5, $6);
          `,
          [
            product.name,
            product.description,
            product.price,
            product.image,
            product.stock,
            categoryId,
          ]
        );
      }

      console.log("Đã tạo 3 sản phẩm nổi bật mẫu.");
    }

    // ========================================
    // ADDITIONAL PRODUCTS
    // ========================================

    const additionalProducts = [
      {
        name: "Loa Bluetooth mini",
        description: "Loa Bluetooth mini nhỏ gọn, âm thanh tiện dụng.",
        price: 350000,
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSo2RJnRHdjTfHV4IWQBiH9Tf4-r6DCffsPcO_ybRCrqs76T8Fm8nGHOpII&s=10",
        stock: 20,
      },
      {
        name: "Củ sạc nhanh USB-C",
        description: "Củ sạc nhanh USB-C nhỏ gọn, tiện lợi.",
        price: 250000,
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsK7yzC8hbOXdZD2XP_x69urG_MkoMMdUcvjr2hL5C62mgWlgarITCOgY&s=10",
        stock: 25,
      },
      {
        name: "Giá đỡ điện thoại",
        description: "Giá đỡ điện thoại để bàn, thuận tiện khi sử dụng.",
        price: 120000,
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSL29DNT0kC4AF0KvTVIHZJW_32wQtnmuQA1z5R0brvMQKE_9k5uqhMIEK&s=10",
        stock: 30,
      },
    ];

    for (const product of additionalProducts) {
      await client.query(
        `
          INSERT INTO products (
            name,
            description,
            price,
            image,
            stock,
            category_id
          )
          SELECT $1, $2, $3, $4, $5, $6
          WHERE NOT EXISTS (
            SELECT 1
            FROM products
            WHERE name = $1
          );
        `,
        [
          product.name,
          product.description,
          product.price,
          product.image,
          product.stock,
          categoryId,
        ]
      );
    }

    await client.query("COMMIT");

    console.log("TechShop PostgreSQL đã sẵn sàng.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Lỗi khởi tạo PostgreSQL:", error);
    throw error;
  } finally {
    client.release();
  }
}

// ========================================
// EXPORT
// ========================================

export { pool, initializeDatabase };
export default pool;
