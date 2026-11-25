
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, initializeDatabase } from "./database.js";

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "Thiếu JWT_SECRET. Hãy khai báo JWT_SECRET trong biến môi trường."
  );
}

// ========================================
// CẤU HÌNH CORS
// ========================================

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
  : ["http://localhost:5173"];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin không được phép truy cập API.")
      );
    },
  })
);

app.use(express.json({ limit: "1mb" }));

// ========================================
// CẤU HÌNH TÀI KHOẢN ADMIN
// ========================================

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function ensureAdminAccount() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log(
      "Chưa cấu hình ADMIN_EMAIL hoặc ADMIN_PASSWORD. Bỏ qua tạo Admin."
    );
    return;
  }

  if (ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD.length > 72) {
    throw new Error(
      "ADMIN_PASSWORD phải dài từ 8 đến 72 ký tự."
    );
  }

  const existingAdmin = await pool.query(
    `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [ADMIN_EMAIL]
  );

  if (existingAdmin.rows.length > 0) {
    console.log("Tài khoản Admin đã tồn tại:", ADMIN_EMAIL);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await pool.query(
    `
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, 'admin')
    `,
    ["Admin Duy", ADMIN_EMAIL, passwordHash]
  );

  console.log("Đã tạo tài khoản Admin:", ADMIN_EMAIL);
}

// ========================================
// XÁC THỰC TOKEN
// ========================================

async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1];

  if (!token) {
    return res.status(401).json({
      message: "Bạn cần đăng nhập để thực hiện thao tác này.",
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!payload?.sub) {
      return res.status(401).json({
        message: "Token không chứa tài khoản hợp lệ.",
      });
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({
        message: "Token không chứa tài khoản hợp lệ.",
      });
    }

    const result = await pool.query(
      `
        SELECT id, full_name, email, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        message:
          "Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        message:
          "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
      });
    }

    console.error("Lỗi xác thực người dùng:", error);

    return res.status(500).json({
      message: "Không thể xác thực tài khoản.",
    });
  }
}

// ========================================
// PHÂN QUYỀN ADMIN
// ========================================

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      message:
        "Bạn không có quyền quản trị để thực hiện thao tác này.",
    });
  }

  next();
}

// ========================================
// API ĐĂNG KÝ KHÁCH HÀNG
// POST /api/auth/register
// ========================================

app.post("/api/auth/register", async (req, res) => {
  const fullName =
    typeof req.body?.full_name === "string"
      ? req.body.full_name.trim()
      : "";

  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!fullName || !email || !password) {
    return res.status(400).json({
      message: "Vui lòng nhập đầy đủ họ tên, email và mật khẩu.",
    });
  }

  if (fullName.length > 100) {
    return res.status(400).json({
      message: "Họ tên không được vượt quá 100 ký tự.",
    });
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      message: "Địa chỉ email không hợp lệ.",
    });
  }

  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({
      message: "Mật khẩu phải dài từ 8 đến 72 ký tự.",
    });
  }

  if (ADMIN_EMAIL && email === ADMIN_EMAIL) {
    return res.status(409).json({
      message: "Email này dành riêng cho tài khoản Admin.",
    });
  }

  try {
    const existingUser = await pool.query(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Email đã được đăng ký. Vui lòng đăng nhập.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          role
        )
        VALUES ($1, $2, $3, 'customer')
        RETURNING id
      `,
      [fullName, email, passwordHash]
    );

    return res.status(201).json({
      message: "Đăng ký thành công. Bạn có thể đăng nhập.",
      user: {
        id: result.rows[0].id,
        full_name: fullName,
        email,
        role: "customer",
      },
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Email đã được đăng ký.",
      });
    }

    console.error("Lỗi đăng ký:", error);

    return res.status(500).json({
      message: "Không thể đăng ký tài khoản lúc này.",
    });
  }
});

// ========================================
// API ĐĂNG NHẬP
// POST /api/auth/login
// ========================================

app.post("/api/auth/login", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!email || !password) {
    return res.status(400).json({
      message: "Vui lòng nhập email và mật khẩu.",
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          full_name,
          email,
          password_hash,
          role
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [email]
    );

    const user = result.rows[0];

    if (
      !user ||
      !user.password_hash ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không chính xác.",
      });
    }

    const token = jwt.sign(
      { sub: String(user.id) },
      JWT_SECRET,
      {
        expiresIn: "8h",
        algorithm: "HS256",
      }
    );

    return res.json({
      message: "Đăng nhập thành công.",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);

    return res.status(500).json({
      message: "Không thể đăng nhập lúc này.",
    });
  }
});

// ========================================
// KIỂM TRA TÀI KHOẢN ĐANG ĐĂNG NHẬP
// GET /api/auth/me
// ========================================

app.get("/api/auth/me", authenticateToken, (req, res) => {
  return res.json({
    user: req.user,
  });
});

// ========================================
// KIỂM TRA API VÀ HEALTH CHECK
// ========================================

app.get("/", (req, res) => {
  return res.json({
    message: "TechShop API đang hoạt động!",
  });
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "ok",
      message: "TechShop API và PostgreSQL đang hoạt động.",
    });
  } catch (error) {
    console.error("Health check database lỗi:", error);

    return res.status(503).json({
      status: "error",
      message: "Không thể kết nối PostgreSQL.",
    });
  }
});

// ========================================
// QUẢN LÝ SẢN PHẨM
// ========================================

// GET: Danh sách sản phẩm - Công khai

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.price,
          p.image,
          p.stock,
          p.category_id,
          c.name AS category
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.id ASC
      `
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Lỗi lấy danh sách sản phẩm:", error);

    return res.status(500).json({
      message: "Không thể tải danh sách sản phẩm.",
    });
  }
});

// GET: Chi tiết sản phẩm - Công khai

app.get("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      message: "ID sản phẩm không hợp lệ.",
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.price,
          p.image,
          p.stock,
          p.category_id,
          c.name AS category
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1
      `,
      [id]
    );

    const product = result.rows[0];

    if (!product) {
      return res.status(404).json({
        message: "Không tìm thấy sản phẩm.",
      });
    }

    return res.json(product);
  } catch (error) {
    console.error("Lỗi lấy chi tiết sản phẩm:", error);

    return res.status(500).json({
      message: "Không thể tải thông tin sản phẩm.",
    });
  }
});

// POST: Thêm sản phẩm - Chỉ Admin

app.post(
  "/api/products",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const {
      name,
      description = "",
      price,
      image = "",
      stock = 0,
      category,
    } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Number.isSafeInteger(price) ||
      price < 0 ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      typeof description !== "string" ||
      typeof image !== "string" ||
      typeof category !== "string" ||
      !category.trim()
    ) {
      return res.status(400).json({
        message: "Thông tin sản phẩm không hợp lệ.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const categoryResult = await client.query(
        `
          INSERT INTO categories (name)
          VALUES ($1)
          ON CONFLICT (name) DO UPDATE
          SET name = EXCLUDED.name
          RETURNING id
        `,
        [category.trim()]
      );

      const categoryId = categoryResult.rows[0].id;

      const insertResult = await client.query(
        `
          INSERT INTO products (
            name,
            description,
            price,
            image,
            stock,
            category_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [
          name.trim(),
          description.trim(),
          price,
          image.trim(),
          stock,
          categoryId,
        ]
      );

      const productId = insertResult.rows[0].id;

      const productResult = await client.query(
        `
          SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.image,
            p.stock,
            p.category_id,
            c.name AS category
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.id = $1
        `,
        [productId]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Thêm sản phẩm thành công.",
        product: productResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Lỗi thêm sản phẩm:", error);

      return res.status(500).json({
        message: "Không thể thêm sản phẩm.",
      });
    } finally {
      client.release();
    }
  }
);

// PUT: Cập nhật sản phẩm - Chỉ Admin

app.put(
  "/api/products/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "ID sản phẩm không hợp lệ.",
      });
    }

    const {
      name,
      description = "",
      price,
      image = "",
      stock = 0,
      category,
    } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Number.isSafeInteger(price) ||
      price < 0 ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      typeof description !== "string" ||
      typeof image !== "string" ||
      typeof category !== "string" ||
      !category.trim()
    ) {
      return res.status(400).json({
        message: "Thông tin sản phẩm không hợp lệ.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existingProduct = await client.query(
        "SELECT id FROM products WHERE id = $1",
        [id]
      );

      if (existingProduct.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Không tìm thấy sản phẩm.",
        });
      }

      const categoryResult = await client.query(
        `
          INSERT INTO categories (name)
          VALUES ($1)
          ON CONFLICT (name) DO UPDATE
          SET name = EXCLUDED.name
          RETURNING id
        `,
        [category.trim()]
      );

      const categoryId = categoryResult.rows[0].id;

      await client.query(
        `
          UPDATE products
          SET
            name = $1,
            description = $2,
            price = $3,
            image = $4,
            stock = $5,
            category_id = $6
          WHERE id = $7
        `,
        [
          name.trim(),
          description.trim(),
          price,
          image.trim(),
          stock,
          categoryId,
          id,
        ]
      );

      const productResult = await client.query(
        `
          SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.image,
            p.stock,
            p.category_id,
            c.name AS category
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.id = $1
        `,
        [id]
      );

      await client.query("COMMIT");

      return res.json({
        message: "Cập nhật sản phẩm thành công.",
        product: productResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Lỗi cập nhật sản phẩm:", error);

      return res.status(500).json({
        message: "Không thể cập nhật sản phẩm.",
      });
    } finally {
      client.release();
    }
  }
);

// DELETE: Xóa sản phẩm - Chỉ Admin

app.delete(
  "/api/products/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "ID sản phẩm không hợp lệ.",
      });
    }

    try {
      const result = await pool.query(
        "DELETE FROM products WHERE id = $1 RETURNING id",
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "Không tìm thấy sản phẩm.",
        });
      }

      return res.json({
        message: "Xóa sản phẩm thành công.",
      });
    } catch (error) {
      console.error("Lỗi xóa sản phẩm:", error);

      return res.status(500).json({
        message:
          "Không thể xóa sản phẩm. Sản phẩm có thể đã được sử dụng trong đơn hàng.",
      });
    }
  }
);

// ========================================
// TẠO ĐƠN HÀNG - KHÁCH HÀNG ĐÃ ĐĂNG NHẬP
// POST /api/orders
// ========================================

app.post("/api/orders", authenticateToken, async (req, res) => {
  const { customer_name, phone, address, items } = req.body;

  if (
    typeof customer_name !== "string" ||
    !customer_name.trim() ||
    typeof phone !== "string" ||
    !phone.trim() ||
    typeof address !== "string" ||
    !address.trim() ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      message:
        "Vui lòng nhập đầy đủ thông tin và sản phẩm trong đơn hàng.",
    });
  }

  for (const item of items) {
    if (
      !Number.isSafeInteger(Number(item.product_id)) ||
      Number(item.product_id) < 1 ||
      !Number.isSafeInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1
    ) {
      return res.status(400).json({
        message: "Thông tin sản phẩm trong đơn hàng không hợp lệ.",
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let totalAmount = 0;
    const orderItems = [];
    const quantities = new Map();

    // Gộp các sản phẩm trùng ID.

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);

      quantities.set(
        productId,
        (quantities.get(productId) || 0) + quantity
      );
    }

    // Kiểm tra sản phẩm và tồn kho từ database.
    // FOR UPDATE khóa dòng sản phẩm để tránh đặt hàng đồng thời
    // làm vượt quá số lượng tồn kho.

    for (const [productId, quantity] of quantities.entries()) {
      const productResult = await client.query(
        `
          SELECT id, name, price, stock
          FROM products
          WHERE id = $1
          FOR UPDATE
        `,
        [productId]
      );

      const product = productResult.rows[0];

      if (!product) {
        const error = new Error(
          `Không tìm thấy sản phẩm ID ${productId}.`
        );

        error.statusCode = 400;
        throw error;
      }

      if (Number(product.stock) < quantity) {
        const error = new Error(
          `Sản phẩm "${product.name}" không đủ tồn kho.`
        );

        error.statusCode = 400;
        throw error;
      }

      totalAmount += Number(product.price) * quantity;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: Number(product.price),
      });
    }

    // user_id lấy từ tài khoản đã xác thực.

    const orderResult = await client.query(
      `
        INSERT INTO orders (
          user_id,
          customer_name,
          phone,
          address,
          total_amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING id
      `,
      [
        req.user.id,
        customer_name.trim(),
        phone.trim(),
        address.trim(),
        totalAmount,
      ]
    );

    const orderId = orderResult.rows[0].id;

    // Thêm chi tiết sản phẩm vào đơn hàng.

    for (const item of orderItems) {
      await client.query(
        `
          INSERT INTO order_items (
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
        ]
      );

      // Trừ tồn kho.

      const stockResult = await client.query(
        `
          UPDATE products
          SET stock = stock - $1
          WHERE id = $2 AND stock >= $1
          RETURNING id
        `,
        [item.quantity, item.product_id]
      );

      if (stockResult.rowCount === 0) {
        const error = new Error(
          `Không thể cập nhật tồn kho sản phẩm "${item.product_name}".`
        );

        error.statusCode = 400;
        throw error;
      }
    }

    await client.query("COMMIT");

    const order = {
      id: orderId,
      total_amount: totalAmount,
      status: "pending",
      items: orderItems,
    };

    return res.status(201).json({
      message: "Đặt hàng thành công.",
      order,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Lỗi tạo đơn hàng:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Không thể tạo đơn hàng.",
    });
  } finally {
    client.release();
  }
});

// ========================================
// ADMIN: DANH SÁCH ĐƠN HÀNG
// GET /api/orders
// ========================================

app.get(
  "/api/orders",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT
            o.id,
            o.user_id,
            o.customer_name,
            o.phone,
            o.address,
            o.total_amount,
            o.status,
            o.created_at,
            COUNT(oi.id)::INTEGER AS item_count
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          GROUP BY o.id
          ORDER BY o.id DESC
        `
      );

      return res.json(result.rows);
    } catch (error) {
      console.error("Lỗi lấy danh sách đơn hàng:", error);

      return res.status(500).json({
        message: "Không thể tải danh sách đơn hàng.",
      });
    }
  }
);

// ========================================
// ADMIN: CHI TIẾT ĐƠN HÀNG
// GET /api/orders/:id
// ========================================

app.get(
  "/api/orders/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "ID đơn hàng không hợp lệ.",
      });
    }

    try {
      const orderResult = await pool.query(
        `
          SELECT
            id,
            user_id,
            customer_name,
            phone,
            address,
            total_amount,
            status,
            created_at
          FROM orders
          WHERE id = $1
        `,
        [id]
      );

      const order = orderResult.rows[0];

      if (!order) {
        return res.status(404).json({
          message: "Không tìm thấy đơn hàng.",
        });
      }

      const itemsResult = await pool.query(
        `
          SELECT
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            quantity * unit_price AS subtotal
          FROM order_items
          WHERE order_id = $1
          ORDER BY id
        `,
        [id]
      );

      return res.json({
        ...order,
        items: itemsResult.rows,
      });
    } catch (error) {
      console.error("Lỗi lấy chi tiết đơn hàng:", error);

      return res.status(500).json({
        message: "Không thể tải chi tiết đơn hàng.",
      });
    }
  }
);

// ========================================
// ADMIN: CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG
// PUT /api/orders/:id/status
// ========================================

app.put(
  "/api/orders/:id/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "processing",
      "completed",
      "cancelled",
    ];

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return res.status(400).json({
        message: "ID đơn hàng không hợp lệ.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Trạng thái đơn hàng không hợp lệ.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const orderResult = await client.query(
        `
          SELECT id, status
          FROM orders
          WHERE id = $1
          FOR UPDATE
        `,
        [orderId]
      );

      const order = orderResult.rows[0];

      if (!order) {
        const error = new Error("Không tìm thấy đơn hàng.");
        error.statusCode = 404;
        throw error;
      }

      if (order.status === "cancelled" && status !== "cancelled") {
        const error = new Error(
          "Đơn hàng đã hủy không thể chuyển sang trạng thái khác."
        );

        error.statusCode = 400;
        throw error;
      }

      if (order.status === "completed" && status === "cancelled") {
        const error = new Error(
          "Đơn hàng đã hoàn thành không thể hủy."
        );

        error.statusCode = 400;
        throw error;
      }

      // Chỉ hoàn tồn kho khi chuyển từ trạng thái chưa hủy sang hủy.

      if (status === "cancelled" && order.status !== "cancelled") {
        const itemsResult = await client.query(
          `
            SELECT product_id, quantity
            FROM order_items
            WHERE order_id = $1
          `,
          [orderId]
        );

        for (const item of itemsResult.rows) {
          if (item.product_id != null) {
            await client.query(
              `
                UPDATE products
                SET stock = stock + $1
                WHERE id = $2
              `,
              [item.quantity, item.product_id]
            );
          }
        }
      }

      await client.query(
        `
          UPDATE orders
          SET status = $1
          WHERE id = $2
        `,
        [status, orderId]
      );

      await client.query("COMMIT");

      return res.json({
        message:
          status === "cancelled"
            ? "Hủy đơn hàng và hoàn tồn kho thành công."
            : "Cập nhật trạng thái đơn hàng thành công.",
        orderId,
        status,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Lỗi cập nhật trạng thái đơn hàng:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Không thể cập nhật trạng thái đơn hàng.",
      });
    } finally {
      client.release();
    }
  }
);

// ========================================
// KHÁCH HÀNG: DANH SÁCH ĐƠN HÀNG CỦA TÔI
// GET /api/my-orders
// ========================================

app.get(
  "/api/my-orders",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT
            o.id,
            o.customer_name,
            o.phone,
            o.address,
            o.total_amount,
            o.status,
            o.created_at,
            COUNT(oi.id)::INTEGER AS item_count
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.user_id = $1
          GROUP BY o.id
          ORDER BY o.created_at DESC, o.id DESC
        `,
        [req.user.id]
      );

      return res.json(result.rows);
    } catch (error) {
      console.error("Lỗi lấy đơn hàng của khách:", error);

      return res.status(500).json({
        message: "Không thể tải đơn hàng của bạn.",
      });
    }
  }
);

// ========================================
// KHÁCH HÀNG: CHI TIẾT ĐƠN HÀNG CỦA TÔI
// GET /api/my-orders/:id
// ========================================

app.get(
  "/api/my-orders/:id",
  authenticateToken,
  async (req, res) => {
    const orderId = Number(req.params.id);

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return res.status(400).json({
        message: "ID đơn hàng không hợp lệ.",
      });
    }

    try {
      const orderResult = await pool.query(
        `
          SELECT
            id,
            customer_name,
            phone,
            address,
            total_amount,
            status,
            created_at
          FROM orders
          WHERE id = $1 AND user_id = $2
        `,
        [orderId, req.user.id]
      );

      const order = orderResult.rows[0];

      if (!order) {
        return res.status(404).json({
          message: "Không tìm thấy đơn hàng.",
        });
      }

      const itemsResult = await pool.query(
        `
          SELECT
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            quantity * unit_price AS subtotal
          FROM order_items
          WHERE order_id = $1
          ORDER BY id
        `,
        [orderId]
      );

      return res.json({
        ...order,
        items: itemsResult.rows,
      });
    } catch (error) {
      console.error(
        "Lỗi lấy chi tiết đơn hàng của khách:",
        error
      );

      return res.status(500).json({
        message: "Không thể tải chi tiết đơn hàng.",
      });
    }
  }
);

// ========================================
// DASHBOARD - CHỈ ADMIN
// ========================================

// GET: Thống kê tổng quan
// GET /api/dashboard/summary

app.get(
  "/api/dashboard/summary",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const productsResult = await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total_products,
            COALESCE(SUM(stock), 0)::INTEGER AS total_stock,
            COALESCE(
              SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END),
              0
            )::INTEGER AS out_of_stock
          FROM products
        `
      );

      const ordersResult = await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total_orders,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 'pending' THEN 1
                  ELSE 0
                END
              ),
              0
            )::INTEGER AS pending_orders,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 'processing' THEN 1
                  ELSE 0
                END
              ),
              0
            )::INTEGER AS processing_orders,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 'completed' THEN 1
                  ELSE 0
                END
              ),
              0
            )::INTEGER AS completed_orders,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 'cancelled' THEN 1
                  ELSE 0
                END
              ),
              0
            )::INTEGER AS cancelled_orders,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 'completed' THEN total_amount
                  ELSE 0
                END
              ),
              0
            )::BIGINT AS total_revenue

          FROM orders
        `
      );

      // Doanh thu trong ngày hiện tại theo múi giờ Việt Nam.

      const revenueTodayResult = await pool.query(
        `
          SELECT
            COALESCE(SUM(total_amount), 0)::BIGINT AS revenue
          FROM orders
          WHERE status = 'completed'
            AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
                = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
        `
      );

      return res.json({
        ...productsResult.rows[0],
        ...ordersResult.rows[0],
        revenue_today: revenueTodayResult.rows[0].revenue,
      });
    } catch (error) {
      console.error("Lỗi thống kê Dashboard:", error);

      return res.status(500).json({
        message: "Không thể tải dữ liệu thống kê.",
      });
    }
  }
);

// ========================================
// DASHBOARD: DOANH THU 7 NGÀY GẦN NHẤT
// GET /api/dashboard/revenue
// ========================================

app.get(
  "/api/dashboard/revenue",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          WITH days AS (
            SELECT
              generate_series(
                (
                  (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
                  - INTERVAL '6 days'
                ),
                (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE,
                INTERVAL '1 day'
              )::DATE AS day
          )

          SELECT
            TO_CHAR(days.day, 'YYYY-MM-DD') AS date,

            COALESCE(
              SUM(
                CASE
                  WHEN orders.status = 'completed'
                    THEN orders.total_amount
                  ELSE 0
                END
              ),
              0
            )::BIGINT AS revenue

          FROM days

          LEFT JOIN orders
            ON (
              orders.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )::DATE = days.day

          GROUP BY days.day
          ORDER BY days.day
        `
      );

      return res.json(result.rows);
    } catch (error) {
      console.error("Lỗi lấy biểu đồ doanh thu:", error);

      return res.status(500).json({
        message: "Không thể tải biểu đồ doanh thu.",
      });
    }
  }
);

// ========================================
// DASHBOARD: TOP 5 SẢN PHẨM BÁN CHẠY
// GET /api/dashboard/top-products
// ========================================

app.get(
  "/api/dashboard/top-products",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT
            oi.product_name AS name,
            SUM(oi.quantity)::INTEGER AS total_sold,
            SUM(
              oi.quantity * oi.unit_price
            )::BIGINT AS revenue

          FROM order_items oi

          INNER JOIN orders o
            ON o.id = oi.order_id

          WHERE o.status = 'completed'

          GROUP BY oi.product_name

          ORDER BY total_sold DESC, revenue DESC

          LIMIT 5
        `
      );

      return res.json(result.rows);
    } catch (error) {
      console.error("Lỗi lấy sản phẩm bán chạy:", error);

      return res.status(500).json({
        message: "Không thể tải danh sách sản phẩm bán chạy.",
      });
    }
  }
);

// ========================================
// KHỞI ĐỘNG SERVER
// ========================================

async function startServer() {
  try {
    // Kiểm tra và khởi tạo cấu trúc PostgreSQL.
    await initializeDatabase();

    console.log("PostgreSQL đã sẵn sàng.");

    // Tạo tài khoản Admin nếu chưa tồn tại.
    await ensureAdminAccount();

    // Khởi động API server.
    app.listen(PORT, () => {
      console.log(`Backend đang chạy tại port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Không thể khởi động server:", error);

    process.exit(1);
  }
}

startServer();
