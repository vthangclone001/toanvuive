// =====================================================================
// FILE: js/common.js  (KHÔNG CẦN SỬA)
// Các hàm dùng chung cho mọi trang.
// =====================================================================
import { sb } from "./supabase.js";

// esc: biến ký tự đặc biệt thành an toàn trước khi hiện lên trang
// (chống người khác chèn mã độc vào nội dung câu hỏi, tên...).
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

// renderMath: biến $...$ trong một khối thành công thức Toán (KaTeX).
export function renderMath(el) {
  if (typeof window.renderMathInElement !== "function") return;
  window.renderMathInElement(el, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true },
    ],
    throwOnError: false,
  });
}

// toast: hộp thông báo nhỏ ở cuối màn hình (type = "error" thì màu đỏ).
let toastTimer;
export function toast(msg, type = "ok") {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.className = "toast" + (type === "error" ? " error" : "");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = "none"), 3500);
}

// friendlyError: đổi thông báo lỗi tiếng Anh của Supabase sang tiếng Việt.
export function friendlyError(err) {
  const m = (err && err.message) || String(err);
  const map = [
    ["Invalid login credentials", "Email hoặc mật khẩu không đúng."],
    ["User already registered", "Email này đã được đăng ký."],
    ["Password should be at least", "Mật khẩu phải có ít nhất 6 ký tự."],
    ["Unable to validate email", "Email không hợp lệ."],
    ["rate limit", "Bạn thao tác quá nhanh, hãy thử lại sau ít phút."],
    ["Failed to fetch", "Không kết nối được máy chủ. Hãy kiểm tra mạng và file config.js."],
  ];
  for (const [k, v] of map) if (m.includes(k)) return v;
  return m;
}

// trangChu: giáo viên -> teacher.html, học sinh -> student.html
export const trangChu = (role) => (role === "teacher" ? "teacher.html" : "student.html");

const dung = () => new Promise(() => {}); // dừng code khi đang chuyển trang

// requireUser: kiểm tra đã đăng nhập đúng vai trò chưa.
// Chưa đăng nhập -> về index.html. Sai vai trò -> sang trang đúng vai trò.
export async function requireUser(role) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.replace("index.html");
    await dung();
  }
  const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (!profile) {
    await sb.auth.signOut();
    location.replace("index.html");
    await dung();
  }
  if (profile.role !== role) {
    location.replace(trangChu(profile.role));
    await dung();
  }
  return { user: session.user, profile };
}

// logout: đăng xuất rồi về trang đăng nhập.
export async function logout() {
  await sb.auth.signOut();
  location.replace("index.html");
}

// fmtDate: hiện ngày theo kiểu Việt Nam (dd/mm/yyyy).
export const fmtDate = (d) => new Date(d).toLocaleDateString("vi-VN");
