import bcrypt from "bcryptjs";
import db from "./database.js";

const name = process.env.ADMIN_NAME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function createAdmin() {
  try {
    // Kiểm tra thông tin cấu hình
    if (!name || !email || !password) {
      throw new Error(
        "Vui lòng khai báo ADMIN_NAME, ADMIN_EMAIL và ADMIN_PASSWORD trong file .env."
      );
    }

    if (password.length < 12) {
      throw new Error(
        "Mật khẩu Admin phải có ít nhất 12 ký tự."
      );
    }

    // Kiểm tra cấu trúc bảng users
    const columns = db.prepare("PRAGMA table_info(users)").all();
    const requiredColumns = [
      "id",
      "full_name",
      "email",
      "password_hash",
      "role",
    ];

    const missingColumns = requiredColumns.filter(
      (column) => !columns.some((item) => item.name === column)
    );

    if (missingColumns.length > 0) {
      throw new Error(
        `Bảng users đang thiếu cột: ${missingColumns.join(", ")}. Hãy cập nhật database.js trước.`
      );
    }

    // Không ghi đè tài khoản đã tồn tại
    const existingUser = db
      .prepare("SELECT id FROM users WHERE lower(email) = ?")
      .get(email);

    if (existingUser) {
      throw new Error(
        "Email này đã tồn tại. Hãy chọn email khác để tạo Admin."
      );
    }

    // Mã hóa mật khẩu
    const passwordHash = await bcrypt.hash(password, 12);

    // Tạo tài khoản Admin
    const result = db
      .prepare(`
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          role
        )
        VALUES (?, ?, ?, 'admin')
      `)
      .run(name, email, passwordHash);

    console.log("================================");
    console.log("TẠO TÀI KHOẢN ADMIN THÀNH CÔNG");
    console.log("================================");
    console.log(`ID: ${result.lastInsertRowid}`);
    console.log(`Tên: ${name}`);
    console.log(`Email: ${email}`);
    console.log("Vai trò: admin");
    console.log("Mật khẩu đã được mã hóa bằng bcrypt.");
  } catch (error) {
    console.error("Không thể tạo Admin:", error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

createAdmin();