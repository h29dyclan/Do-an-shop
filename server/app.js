import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./database.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "Thiếu JWT_SECRET. Hãy khai báo JWT_SECRET trong biến môi trường."
  );
}

// ========================================
// CORS CONFIGURATION
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

  const existingAdmin = db
    .prepare(`
      SELECT id
      FROM users
      WHERE lower(email) = ?
    `)
    .get(ADMIN_EMAIL);

  if (existingAdmin) {
    console.log("Tài khoản Admin đã tồn tại:", ADMIN_EMAIL);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  db.prepare(`
    INSERT INTO users (
      full_name,
      email,
      password_hash,
      role
    )
    VALUES (?, ?, ?, 'admin')
  `).run("Admin Duy", ADMIN_EMAIL, passwordHash);

  console.log("Đã tạo tài khoản Admin:", ADMIN_EMAIL);
}

// ========================================
// XÁC THỰC TOKEN
// ========================================

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1];

  if (!token) {
    return res.status(401).json({
      message: "Bạn cần đăng nhập để thực hiện thao tác này.",
    });
  }

  jwt.verify(
    token,
    JWT_SECRET,
    { algorithms: ["HS256"] },
    (error, payload) => {
      if (error || !payload?.sub) {
        return res.status(401).json({
          message:
            "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        });
      }

      const userId = Number(payload.sub);

      if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(401).json({
          message: "Token không chứa tài khoản hợp lệ.",
        });
      }

      try {
        const user = db
          .prepare(`
            SELECT id, full_name, email, role
            FROM users
            WHERE id = ?
          `)
          .get(userId);

        if (!user) {
          return res.status(401).json({
            message:
              "Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.",
          });
        }

        req.user = user;
        next();
      } catch (error) {
        console.error("Lỗi xác thực người dùng:", error);

        return res.status(500).json({
          message: "Không thể xác thực tài khoản.",
        });
      }
    }
  );
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
    const existingUser = db
      .prepare(`
        SELECT id
        FROM users
        WHERE lower(email) = ?
      `)
      .get(email);

    if (existingUser) {
      return res.status(409).json({
        message: "Email đã được đăng ký. Vui lòng đăng nhập.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        role
      )
      VALUES (?, ?, ?, 'customer')
    `).run(fullName, email, passwordHash);

    return res.status(201).json({
      message: "Đăng ký thành công. Bạn có thể đăng nhập.",
      user: {
        id: Number(result.lastInsertRowid),
        full_name: fullName,
        email,
        role: "customer",
      },
    });
  } catch (error) {
    if (String(error.code || "").includes("CONSTRAINT")) {
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
    const user = db
      .prepare(`
        SELECT
          id,
          full_name,
          email,
          password_hash,
          role
        FROM users
        WHERE lower(email) = ?
      `)
      .get(email);

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

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "TechShop API đang hoạt động.",
  });
});

// ========================================
// QUẢN LÝ SẢN PHẨM
// ========================================

// GET: Danh sách sản phẩm - Công khai

app.get("/api/products", (req, res) => {
  try {
    const products = db
      .prepare(`
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
      `)
      .all();

    return res.json(products);
  } catch (error) {
    console.error("Lỗi lấy danh sách sản phẩm:", error);

    return res.status(500).json({
      message: "Không thể tải danh sách sản phẩm.",
    });
  }
});

// GET: Chi tiết sản phẩm - Công khai

app.get("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      message: "ID sản phẩm không hợp lệ.",
    });
  }

  try {
    const product = db
      .prepare(`
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
        WHERE p.id = ?
      `)
      .get(id);

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
  (req, res) => {
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

    try {
      const insertProduct = db.transaction(() => {
        db.prepare(`
          INSERT OR IGNORE INTO categories (name)
          VALUES (?)
        `).run(category.trim());

        const categoryRow = db
          .prepare(`
            SELECT id
            FROM categories
            WHERE name = ?
          `)
          .get(category.trim());

        const result = db.prepare(`
          INSERT INTO products (
            name,
            description,
            price,
            image,
            stock,
            category_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          name.trim(),
          description.trim(),
          price,
          image.trim(),
          stock,
          categoryRow.id
        );

        return Number(result.lastInsertRowid);
      });

      const productId = insertProduct();

      const product = db
        .prepare(`
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
          WHERE p.id = ?
        `)
        .get(productId);

      return res.status(201).json({
        message: "Thêm sản phẩm thành công.",
        product,
      });
    } catch (error) {
      console.error("Lỗi thêm sản phẩm:", error);

      return res.status(500).json({
        message: "Không thể thêm sản phẩm.",
      });
    }
  }
);

// PUT: Cập nhật sản phẩm - Chỉ Admin

app.put(
  "/api/products/:id",
  authenticateToken,
  requireAdmin,
  (req, res) => {
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

    try {
      const existingProduct = db
        .prepare("SELECT id FROM products WHERE id = ?")
        .get(id);

      if (!existingProduct) {
        return res.status(404).json({
          message: "Không tìm thấy sản phẩm.",
        });
      }

      const updateProduct = db.transaction(() => {
        db.prepare(`
          INSERT OR IGNORE INTO categories (name)
          VALUES (?)
        `).run(category.trim());

        const categoryRow = db
          .prepare(`
            SELECT id
            FROM categories
            WHERE name = ?
          `)
          .get(category.trim());

        db.prepare(`
          UPDATE products
          SET
            name = ?,
            description = ?,
            price = ?,
            image = ?,
            stock = ?,
            category_id = ?
          WHERE id = ?
        `).run(
          name.trim(),
          description.trim(),
          price,
          image.trim(),
          stock,
          categoryRow.id,
          id
        );
      });

      updateProduct();

      const product = db
        .prepare(`
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
          WHERE p.id = ?
        `)
        .get(id);

      return res.json({
        message: "Cập nhật sản phẩm thành công.",
        product,
      });
    } catch (error) {
      console.error("Lỗi cập nhật sản phẩm:", error);

      return res.status(500).json({
        message: "Không thể cập nhật sản phẩm.",
      });
    }
  }
);

// DELETE: Xóa sản phẩm - Chỉ Admin

app.delete(
  "/api/products/:id",
  authenticateToken,
  requireAdmin,
  (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "ID sản phẩm không hợp lệ.",
      });
    }

    try {
      const result = db
        .prepare("DELETE FROM products WHERE id = ?")
        .run(id);

      if (result.changes === 0) {
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

app.post("/api/orders", authenticateToken, (req, res) => {
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

  try {
    const createOrder = db.transaction(() => {
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

      for (const [productId, quantity] of quantities.entries()) {
        const product = db
          .prepare(`
            SELECT id, name, price, stock
            FROM products
            WHERE id = ?
          `)
          .get(productId);

        if (!product) {
          const error = new Error(
            `Không tìm thấy sản phẩm ID ${productId}.`
          );

          error.statusCode = 400;
          throw error;
        }

        if (product.stock < quantity) {
          const error = new Error(
            `Sản phẩm "${product.name}" không đủ tồn kho.`
          );

          error.statusCode = 400;
          throw error;
        }

        totalAmount += product.price * quantity;

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity,
          unit_price: product.price,
        });
      }

      // user_id lấy từ tài khoản đã xác thực.

      const orderResult = db
        .prepare(`
          INSERT INTO orders (
            user_id,
            customer_name,
            phone,
            address,
            total_amount,
            status
          )
          VALUES (?, ?, ?, ?, ?, 'pending')
        `)
        .run(
          req.user.id,
          customer_name.trim(),
          phone.trim(),
          address.trim(),
          totalAmount
        );

      const orderId = Number(orderResult.lastInsertRowid);

      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          quantity,
          unit_price
        )
        VALUES (?, ?, ?, ?, ?)
      `);

      const decreaseStock = db.prepare(`
        UPDATE products
        SET stock = stock - ?
        WHERE id = ? AND stock >= ?
      `);

      for (const item of orderItems) {
        insertOrderItem.run(
          orderId,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price
        );

        const stockResult = decreaseStock.run(
          item.quantity,
          item.product_id,
          item.quantity
        );

        if (stockResult.changes === 0) {
          const error = new Error(
            `Không thể cập nhật tồn kho sản phẩm "${item.product_name}".`
          );

          error.statusCode = 400;
          throw error;
        }
      }

      return {
        id: orderId,
        total_amount: totalAmount,
        status: "pending",
        items: orderItems,
      };
    });

    const order = createOrder();

    return res.status(201).json({
      message: "Đặt hàng thành công.",
      order,
    });
  } catch (error) {
    console.error("Lỗi tạo đơn hàng:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Không thể tạo đơn hàng.",
    });
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
  (req, res) => {
    try {
      const orders = db
        .prepare(`
          SELECT
            o.id,
            o.user_id,
            o.customer_name,
            o.phone,
            o.address,
            o.total_amount,
            o.status,
            o.created_at,
            COUNT(oi.id) AS item_count
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          GROUP BY o.id
          ORDER BY o.id DESC
        `)
        .all();

      return res.json(orders);
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
  (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        message: "ID đơn hàng không hợp lệ.",
      });
    }

    try {
      const order = db
        .prepare(`
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
          WHERE id = ?
        `)
        .get(id);

      if (!order) {
        return res.status(404).json({
          message: "Không tìm thấy đơn hàng.",
        });
      }

      const items = db
        .prepare(`
          SELECT
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            quantity * unit_price AS subtotal
          FROM order_items
          WHERE order_id = ?
          ORDER BY id
        `)
        .all(id);

      return res.json({
        ...order,
        items,
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
  (req, res) => {
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

    try {
      const updateOrder = db.transaction(() => {
        const order = db
          .prepare(`
            SELECT id, status
            FROM orders
            WHERE id = ?
          `)
          .get(orderId);

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
          const items = db
            .prepare(`
              SELECT product_id, quantity
              FROM order_items
              WHERE order_id = ?
            `)
            .all(orderId);

          const restoreStock = db.prepare(`
            UPDATE products
            SET stock = stock + ?
            WHERE id = ?
          `);

          for (const item of items) {
            if (item.product_id != null) {
              restoreStock.run(item.quantity, item.product_id);
            }
          }
        }

        db.prepare(`
          UPDATE orders
          SET status = ?
          WHERE id = ?
        `).run(status, orderId);

        return { orderId, status };
      });

      const result = updateOrder();

      return res.json({
        message:
          status === "cancelled"
            ? "Hủy đơn hàng và hoàn tồn kho thành công."
            : "Cập nhật trạng thái đơn hàng thành công.",
        ...result,
      });
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái đơn hàng:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Không thể cập nhật trạng thái đơn hàng.",
      });
    }
  }
);

// ========================================
// KHÁCH HÀNG: DANH SÁCH ĐƠN HÀNG CỦA TÔI
// GET /api/my-orders
// ========================================

app.get("/api/my-orders", authenticateToken, (req, res) => {
  try {
    const orders = db
      .prepare(`
        SELECT
          o.id,
          o.customer_name,
          o.phone,
          o.address,
          o.total_amount,
          o.status,
          o.created_at,
          COUNT(oi.id) AS item_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC, o.id DESC
      `)
      .all(req.user.id);

    return res.json(orders);
  } catch (error) {
    console.error("Lỗi lấy đơn hàng của khách:", error);

    return res.status(500).json({
      message: "Không thể tải đơn hàng của bạn.",
    });
  }
});

// ========================================
// KHÁCH HÀNG: CHI TIẾT ĐƠN HÀNG CỦA TÔI
// GET /api/my-orders/:id
// ========================================

app.get("/api/my-orders/:id", authenticateToken, (req, res) => {
  const orderId = Number(req.params.id);

  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return res.status(400).json({
      message: "ID đơn hàng không hợp lệ.",
    });
  }

  try {
    const order = db
      .prepare(`
        SELECT
          id,
          customer_name,
          phone,
          address,
          total_amount,
          status,
          created_at
        FROM orders
        WHERE id = ? AND user_id = ?
      `)
      .get(orderId, req.user.id);

    if (!order) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    const items = db
      .prepare(`
        SELECT
          id,
          product_id,
          product_name,
          quantity,
          unit_price,
          quantity * unit_price AS subtotal
        FROM order_items
        WHERE order_id = ?
        ORDER BY id
      `)
      .all(orderId);

    return res.json({
      ...order,
      items,
    });
  } catch (error) {
    console.error("Lỗi lấy chi tiết đơn hàng của khách:", error);

    return res.status(500).json({
      message: "Không thể tải chi tiết đơn hàng.",
    });
  }
});

// ========================================
// DASHBOARD - CHỈ ADMIN
// ========================================

// GET: Thống kê tổng quan

app.get(
  "/api/dashboard/summary",
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const products = db
        .prepare(`
          SELECT
            COUNT(*) AS total_products,
            COALESCE(SUM(stock), 0) AS total_stock,
            COALESCE(
              SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END),
              0
            ) AS out_of_stock
          FROM products
        `)
        .get();

      const orders = db
        .prepare(`
          SELECT
            COUNT(*) AS total_orders,
            COALESCE(
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END),
              0
            ) AS pending_orders,
            COALESCE(
              SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END),
              0
            ) AS processing_orders,
            COALESCE(
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),
              0
            ) AS completed_orders,
            COALESCE(
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END),
              0
            ) AS cancelled_orders,
            COALESCE(
              SUM(
                CASE
                  WHEN status = 'completed' THEN total_amount
                  ELSE 0
                END
              ),
              0
            ) AS total_revenue
          FROM orders
        `)
        .get();

      const revenueToday = db
        .prepare(`
          SELECT COALESCE(SUM(total_amount), 0) AS revenue
          FROM orders
          WHERE status = 'completed'
            AND date(created_at, 'localtime') =
                date('now', 'localtime')
        `)
        .get();

      return res.json({
        ...products,
        ...orders,
        revenue_today: revenueToday.revenue,
      });
    } catch (error) {
      console.error("Lỗi thống kê Dashboard:", error);

      return res.status(500).json({
        message: "Không thể tải dữ liệu thống kê.",
      });
    }
  }
);

// GET: Doanh thu theo ngày trong 7 ngày gần nhất

app.get(
  "/api/dashboard/revenue",
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const revenue = db
        .prepare(`
          WITH RECURSIVE days(day, n) AS (
            SELECT date('now', 'localtime', '-6 days'), 0

            UNION ALL

            SELECT date(day, '+1 day'), n + 1
            FROM days
            WHERE n < 6
          )

          SELECT
            days.day AS date,
            COALESCE(
              SUM(
                CASE
                  WHEN orders.status = 'completed'
                    THEN orders.total_amount
                  ELSE 0
                END
              ),
              0
            ) AS revenue
          FROM days
          LEFT JOIN orders
            ON date(orders.created_at, 'localtime') = days.day
          GROUP BY days.day
          ORDER BY days.day
        `)
        .all();

      return res.json(revenue);
    } catch (error) {
      console.error("Lỗi lấy biểu đồ doanh thu:", error);

      return res.status(500).json({
        message: "Không thể tải biểu đồ doanh thu.",
      });
    }
  }
);

// GET: Top 5 sản phẩm bán chạy

app.get(
  "/api/dashboard/top-products",
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const products = db
        .prepare(`
          SELECT
            oi.product_name AS name,
            SUM(oi.quantity) AS total_sold,
            SUM(oi.quantity * oi.unit_price) AS revenue
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE o.status = 'completed'
          GROUP BY oi.product_name
          ORDER BY total_sold DESC, revenue DESC
          LIMIT 5
        `)
        .all();

      return res.json(products);
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
    await ensureAdminAccount();

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