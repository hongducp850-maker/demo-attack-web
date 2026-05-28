# 🔓 VulnBank - OWASP Top 10 Demo Application

> ⚠️ **CẢNH BÁO**: Ứng dụng này chứa các lỗ hổng bảo mật **CỐ Ý** cho mục đích giáo dục.
> **KHÔNG BAO GIỜ** triển khai ứng dụng này trên môi trường production!

## 📋 Tổng quan

VulnBank là một ứng dụng web ngân hàng giả lập được thiết kế để demo 3 lỗ hổng từ OWASP Top 10:

| # | Lỗ hổng | OWASP ID | Mức độ |
|---|---------|----------|--------|
| 1 | SQL Injection | A03:2021 - Injection | 🔴 Critical |
| 2 | Cross-Site Scripting (XSS) | A03:2021 - Injection | 🟠 High |
| 3 | Broken Access Control | A01:2021 | 🔴 Critical |

## 🚀 Cài đặt & Chạy

```bash
cd vulnerable-web-demo
npm install
npm start
```

Mở trình duyệt: **http://localhost:3000**

## 🔑 Tài khoản test

| Username | Password | Role |
|----------|----------|------|
| admin | SuperSecret@123 | admin |
| john | password123 | user |
| jane | qwerty456 | user |
| bob | bob2024! | user |
| alice | alice_pass | moderator |

---

## 🔓 Lỗ hổng #1: SQL Injection (A03:2021)

### Mô tả
Trang đăng nhập không sử dụng parameterized queries, mà ghép trực tiếp input người dùng vào câu truy vấn SQL.

### Đoạn code lỗi
```javascript
// ❌ VULNERABLE - server.js
const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
```

### Cách khai thác
1. Mở trang đăng nhập: `http://localhost:3000`
2. Nhập vào ô **Username**: `' OR '1'='1' --`
3. Nhập vào ô **Password**: bất kỳ giá trị nào
4. Nhấn **Đăng nhập**

### Kết quả
- Đăng nhập thành công với tư cách user đầu tiên trong database (admin)
- SQL query thực tế: `SELECT * FROM users WHERE username = '' OR '1'='1' --' AND password = '...'`

### Cách khắc phục
```javascript
// ✅ FIXED - Sử dụng parameterized query
const query = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?');
const user = query.get(username, password);
```

---

## 🔓 Lỗ hổng #2: Cross-Site Scripting - XSS (A03:2021)

### Mô tả
Ứng dụng render nội dung bài viết trực tiếp dưới dạng HTML mà không sanitize, cho phép tấn công **Stored XSS** và **Reflected XSS**.

### Đoạn code lỗi
```javascript
// ❌ VULNERABLE - dashboard.html
// Stored XSS: innerHTML được dùng để hiển thị nội dung
feed.innerHTML = posts.map(post => `
  <div class="post-content">${post.content}</div>
`).join('');

// Reflected XSS: query tìm kiếm được phản chiếu trực tiếp
resultsDiv.innerHTML = `Kết quả cho: <strong>${data.query}</strong>`;
```

### Cách khai thác

#### Stored XSS:
1. Đăng nhập và vào Dashboard
2. Đăng bài viết với nội dung: `<img src=x onerror="alert('XSS - Cookie: ' + document.cookie)">`
3. Hoặc: `<b onmouseover="alert('XSS')">Hover vào đây!</b>`

#### Reflected XSS:
1. Nhập vào ô tìm kiếm: `<img src=x onerror="alert('Reflected XSS')">`
2. Nhấn Tìm kiếm

### Kết quả
- Mã JavaScript được thực thi trong trình duyệt
- Attacker có thể đánh cắp cookie, session, hoặc thực hiện các hành động thay mặt người dùng

### Cách khắc phục
```javascript
// ✅ FIXED - Sử dụng textContent thay vì innerHTML
element.textContent = userInput;

// Hoặc sanitize HTML
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

---

## 🔓 Lỗ hổng #3: Broken Access Control (A01:2021)

### Mô tả
Trang Admin và các API quản trị không có kiểm tra quyền truy cập ở phía server. "Bảo mật" chỉ dựa vào việc ẩn nút trên giao diện (client-side).

### Đoạn code lỗi
```javascript
// ❌ VULNERABLE - server.js
// Không có middleware kiểm tra authentication/authorization
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  res.json(users); // Trả về TẤT CẢ user kể cả mật khẩu!
});
```

### Cách khai thác
1. **KHÔNG đăng nhập**, mở trực tiếp: `http://localhost:3000/admin`
2. Hoặc dùng curl/Postman:
   ```bash
   # Xem tất cả user (kể cả mật khẩu!)
   curl http://localhost:3000/api/admin/users
   
   # Xem nhật ký hệ thống
   curl http://localhost:3000/api/admin/logs
   
   # Tự nâng quyền lên admin
   curl -X PUT http://localhost:3000/api/admin/users/2/role \
     -H "Content-Type: application/json" \
     -d '{"role": "admin"}'
   
   # Xóa user
   curl -X DELETE http://localhost:3000/api/admin/users/3
   ```

### Kết quả
- Bất kỳ ai cũng truy cập được trang Admin
- Xem được toàn bộ thông tin user bao gồm mật khẩu
- Có thể xóa user, thay đổi quyền mà không cần đăng nhập

### Cách khắc phục
```javascript
// ✅ FIXED - Thêm middleware kiểm tra quyền
function requireAdmin(req, res, next) {
  const session = verifySession(req.cookies.session);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

app.get('/api/admin/users', requireAdmin, (req, res) => {
  // Chỉ admin mới truy cập được
  const users = db.prepare('SELECT id, username, role, email FROM users').all();
  res.json(users); // KHÔNG trả về mật khẩu!
});
```

---

## 📚 Tài liệu tham khảo

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [A01:2021 - Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [A03:2021 - Injection](https://owasp.org/Top10/A03_2021-Injection/)
