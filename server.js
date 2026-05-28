const express = require('express');
const initSqlJs = require('sql.js');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// Database Setup
// ========================================
let db;

async function initDatabase() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      email TEXT
    )
  `);

  db.run(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sample users
  db.run(`INSERT INTO users (username, password, role, email) VALUES ('admin', 'SuperSecret@123', 'admin', 'admin@vulnapp.com')`);
  db.run(`INSERT INTO users (username, password, role, email) VALUES ('john', 'password123', 'user', 'john@example.com')`);
  db.run(`INSERT INTO users (username, password, role, email) VALUES ('jane', 'qwerty456', 'user', 'jane@example.com')`);
  db.run(`INSERT INTO users (username, password, role, email) VALUES ('bob', 'bob2024!', 'user', 'bob@example.com')`);
  db.run(`INSERT INTO users (username, password, role, email) VALUES ('alice', 'alice_pass', 'moderator', 'alice@example.com')`);

  // Sample posts
  db.run(`INSERT INTO posts (author, content) VALUES ('admin', 'Chào mừng đến với hệ thống! Hãy tuân thủ quy tắc cộng đồng.')`);
  db.run(`INSERT INTO posts (author, content) VALUES ('john', 'Xin chào mọi người! Đây là bài viết đầu tiên của tôi.')`);
  db.run(`INSERT INTO posts (author, content) VALUES ('jane', 'Thời tiết hôm nay đẹp quá! ☀️')`);
  db.run(`INSERT INTO posts (author, content) VALUES ('bob', 'Ai biết cách fix lỗi CSS không ạ?')`);

  // Sample admin logs
  db.run(`INSERT INTO admin_logs (action, details) VALUES ('USER_CREATED', 'Created user john with role user')`);
  db.run(`INSERT INTO admin_logs (action, details) VALUES ('USER_CREATED', 'Created user jane with role user')`);
  db.run(`INSERT INTO admin_logs (action, details) VALUES ('SYSTEM_UPDATE', 'Database schema updated to v2.1')`);
  db.run(`INSERT INTO admin_logs (action, details) VALUES ('CONFIG_CHANGE', 'Changed max upload size to 10MB')`);
  db.run(`INSERT INTO admin_logs (action, details) VALUES ('SECURITY_ALERT', 'Failed login attempt from IP 192.168.1.100')`);

  console.log('✅ Database initialized with sample data');
}

// ========================================
// Database Helpers
// ========================================
function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runRawQuery(sql) {
  const stmt = db.prepare(sql);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ================================================================
// 🔓 LỖ HỔNG #1: SQL INJECTION (A03:2021 - Injection)
// ----------------------------------------------------------------
// Ghép trực tiếp input người dùng vào câu SQL → attacker có thể
// chèn thêm điều kiện để bypass đăng nhập.
// Payload: username = ' OR '1'='1' --    password = bất kỳ
// ================================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // ────── CODE CÓ LỖ HỔNG (đang hoạt động) ──────
 const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
 console.log(`[SQL INJECTION] Query: ${query}`);
 try {
   const results = runRawQuery(query);
   const user = results.length > 0 ? results[0] : null;
  // ────── HẾT CODE LỖ HỔNG ──────

  // ────── CODE ĐÃ FIX (mở comment để phòng chống) ──────
  // Sử dụng parameterized query - input được tách biệt khỏi câu SQL
 // const user = queryOne(
  //'SELECT * FROM users WHERE username = ? AND password = ?',
    //[username, password]
  //);
  //try {
  // ────── HẾT CODE FIX ──────

    if (user) {
      res.cookie('session', JSON.stringify({
        userId: user.id,
        username: user.username,
        role: user.role
      }), { httpOnly: false });

      res.json({
        success: true,
        message: 'Đăng nhập thành công!',
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Sai tên đăng nhập hoặc mật khẩu!'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống',

      // ────── CODE CÓ LỖ HỔNG: lộ chi tiết lỗi SQL cho attacker ──────
      error: err.message,
      query: query
      // ────── CODE ĐÃ FIX (mở comment để phòng chống) ──────
      // // Không trả về chi tiết lỗi cho client
      // error: 'Đã xảy ra lỗi, vui lòng thử lại'
      // ────── HẾT CODE FIX ──────
    });
  }
});

// ========================================
// Posts (chức năng bình thường)
// ========================================
app.get('/api/posts', (req, res) => {
  const posts = queryAll('SELECT * FROM posts ORDER BY created_at DESC');
  res.json(posts);
});

app.post('/api/posts', (req, res) => {
  const { author, content } = req.body;
  db.run('INSERT INTO posts (author, content) VALUES (?, ?)', [author, content]);
  res.json({ success: true, message: 'Bài viết đã được đăng!' });
});

app.delete('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM posts WHERE id = ?', [parseInt(id)]);
  res.json({ success: true, message: 'Đã xóa bài viết' });
});

// ================================================================
// 🔓 LỖ HỔNG #2: IDOR (A01:2021 - Broken Access Control)
// ----------------------------------------------------------------
// API trả về TOÀN BỘ thông tin user (kể cả mật khẩu) chỉ bằng
// cách đổi ID trên URL. Không kiểm tra xem người gọi có quyền
// xem hồ sơ đó hay không.
// Payload: GET /api/profile/1 → xem profile admin kèm mật khẩu
// ================================================================
app.get('/api/profile/:id', (req, res) => {
  const { id } = req.params;
  console.log(`[IDOR] Profile requested for user ID: ${id}`);

  const user = queryOne('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  // ────── CODE CÓ LỖ HỔNG (đang hoạt động) ──────
  // Trả về TẤT CẢ thông tin kể cả mật khẩu, không kiểm tra quyền
  res.json({
    id: user.id,
    username: user.username,
    password: user.password,
    role: user.role,
    email: user.email
  });
  // ────── HẾT CODE LỖ HỔNG ──────

  // ────── CODE ĐÃ FIX (mở comment để phòng chống) ──────
  // // 1. Kiểm tra session - chỉ user đã đăng nhập mới được xem
  // const session = req.cookies.session ? JSON.parse(req.cookies.session) : null;
  // if (!session) {
  //   return res.status(401).json({ message: 'Chưa đăng nhập' });
  // }
  // // 2. Chỉ cho phép xem profile của chính mình (trừ admin)
  // if (session.userId !== parseInt(id) && session.role !== 'admin') {
  //   return res.status(403).json({ message: 'Không có quyền xem hồ sơ này' });
  // }
  // // 3. KHÔNG trả về mật khẩu
  // res.json({
  //   id: user.id,
  //   username: user.username,
  //   role: user.role,
  //   email: user.email
  // });
  // ────── HẾT CODE FIX ──────
});

// ================================================================
// 🔓 LỖ HỔNG #3: BROKEN ACCESS CONTROL (A01:2021)
// ----------------------------------------------------------------
// Các API admin KHÔNG kiểm tra quyền truy cập ở phía server.
// Bất kỳ ai (kể cả chưa đăng nhập) đều gọi được.
// Payload: truy cập /admin hoặc curl /api/admin/users
// ================================================================

// ────── CODE CÓ LỖ HỔNG: không có middleware kiểm tra quyền ──────

// ────── CODE ĐÃ FIX (mở comment để phòng chống) ──────
// // Middleware kiểm tra đã đăng nhập
// function requireAuth(req, res, next) {
//   try {
//     const session = req.cookies.session ? JSON.parse(req.cookies.session) : null;
//     if (!session || !session.userId) {
//       return res.status(401).json({ message: 'Chưa đăng nhập' });
//     }
//     req.user = session;
//     next();
//   } catch (e) {
//     return res.status(401).json({ message: 'Session không hợp lệ' });
//   }
// }
//
// // Middleware kiểm tra quyền admin
// function requireAdmin(req, res, next) {
//   if (req.user.role !== 'admin') {
//     return res.status(403).json({ message: 'Chỉ admin mới có quyền truy cập' });
//   }
//   next();
// }
// ────── HẾT CODE FIX ──────

// Xem tất cả users (kể cả mật khẩu!)
app.get('/api/admin/users', (req, res) => {
  // ────── CODE ĐÃ FIX: thêm middleware vào route ──────
  // Đổi dòng trên thành: app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  // ────── HẾT CODE FIX ──────

  console.log('[BROKEN ACCESS CONTROL] /api/admin/users - NO AUTH CHECK!');

  // ────── CODE CÓ LỖ HỔNG: trả về tất cả kể cả password ──────
  const users = queryAll('SELECT * FROM users');
  res.json(users);
  // ────── CODE ĐÃ FIX (mở comment để phòng chống) ──────
  // // Không trả về mật khẩu
  // const users = queryAll('SELECT id, username, role, email FROM users');
  // res.json(users);
  // ────── HẾT CODE FIX ──────
});

// Xóa user - không kiểm tra quyền
app.delete('/api/admin/users/:id', (req, res) => {
  // ────── CODE ĐÃ FIX: thêm middleware ──────
  // Đổi thành: app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  // ────── HẾT CODE FIX ──────

  const { id } = req.params;
  console.log(`[BROKEN ACCESS CONTROL] DELETE user ${id} - NO AUTH CHECK!`);

  const user = queryOne('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  db.run('DELETE FROM users WHERE id = ?', [parseInt(id)]);
  res.json({ success: true, message: `Đã xóa người dùng: ${user.username}` });
});

// Xem admin logs - không kiểm tra quyền
app.get('/api/admin/logs', (req, res) => {
  // ────── CODE ĐÃ FIX: thêm middleware ──────
  // Đổi thành: app.get('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
  // ────── HẾT CODE FIX ──────

  console.log('[BROKEN ACCESS CONTROL] /api/admin/logs - NO AUTH CHECK!');
  const logs = queryAll('SELECT * FROM admin_logs ORDER BY timestamp DESC');
  res.json(logs);
});

// Đổi role user - không kiểm tra quyền
app.put('/api/admin/users/:id/role', (req, res) => {
  // ────── CODE ĐÃ FIX: thêm middleware ──────
  // Đổi thành: app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  // ────── HẾT CODE FIX ──────

  const { id } = req.params;
  const { role } = req.body;
  console.log(`[BROKEN ACCESS CONTROL] Change role user ${id} → ${role} - NO AUTH CHECK!`);

  db.run('UPDATE users SET role = ? WHERE id = ?', [role, parseInt(id)]);
  res.json({ success: true, message: `Đã cập nhật quyền thành: ${role}` });
});

// ========================================
// Page Routes
// ========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ────── CODE CÓ LỖ HỔNG: không kiểm tra quyền ở server ──────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
// ────── CODE ĐÃ FIX (mở comment để phòng chống) ──────
// app.get('/admin', requireAuth, requireAdmin, (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'admin.html'));
// });
// ────── HẾT CODE FIX ──────

// ========================================
// Start Server
// ========================================
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║       VULNERABLE WEB APP - EDUCATIONAL PURPOSE ONLY       ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Server: http://localhost:${PORT}                            ║
║                                                            ║
║  Lỗ hổng:                                                  ║
║    1. SQL Injection       → POST /api/login                ║
║    2. IDOR                → GET  /api/profile/:id          ║
║    3. Broken Access Ctrl  → GET  /api/admin/*              ║
║                                                            ║
║  Tài khoản test:                                           ║
║    admin / SuperSecret@123                                 ║
║    john  / password123                                     ║
║    jane  / qwerty456                                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
