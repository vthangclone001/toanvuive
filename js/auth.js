// =====================================================================
// FILE: js/auth.js - Xử lý trang đăng nhập / đăng ký (KHÔNG CẦN SỬA)
// =====================================================================
import { sb } from "./supabase.js";
import { toast, friendlyError, trangChu } from "./common.js";

const $ = (id) => document.getElementById(id);

// Nếu đã đăng nhập sẵn thì chuyển thẳng vào trang đúng vai trò
async function vaoTrangChu() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data: profile } = await sb.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile) {
    await sb.auth.signOut();
    return;
  }
  location.replace(trangChu(profile.role));
}
await vaoTrangChu();

// Chuyển qua lại giữa hai tab "Đăng nhập" và "Đăng ký"
function chonTab(dangNhap) {
  $("tab-dn").classList.toggle("active", dangNhap);
  $("tab-dk").classList.toggle("active", !dangNhap);
  $("form-dang-nhap").classList.toggle("hidden", !dangNhap);
  $("form-dang-ky").classList.toggle("hidden", dangNhap);
}
$("tab-dn").onclick = () => chonTab(true);
$("tab-dk").onclick = () => chonTab(false);

// Chọn "Giáo viên" thì hiện ô nhập mã giáo viên
$("dk-vaitro").onchange = () => {
  $("khung-ma-gv").classList.toggle("hidden", $("dk-vaitro").value !== "teacher");
};

// ----- Đăng nhập -----
$("form-dang-nhap").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btn-dang-nhap");
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({
    email: $("dn-email").value.trim(),
    password: $("dn-matkhau").value,
  });
  if (error) {
    toast(friendlyError(error), "error");
    btn.disabled = false;
    return;
  }
  await vaoTrangChu();
  btn.disabled = false;
});

// ----- Đăng ký -----
$("form-dang-ky").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btn-dang-ky");
  const hoTen = $("dk-hoten").value.trim();
  const role = $("dk-vaitro").value;
  if (!hoTen) return toast("Hãy nhập họ và tên.", "error");

  btn.disabled = true;
  // Họ tên, vai trò, mã giáo viên được gửi kèm; Supabase tự tạo hồ sơ (xem schema.sql)
  const { data, error } = await sb.auth.signUp({
    email: $("dk-email").value.trim(),
    password: $("dk-matkhau").value,
    options: { data: { full_name: hoTen, role, teacher_code: $("dk-magv").value.trim() } },
  });
  if (error) {
    toast(friendlyError(error), "error");
    btn.disabled = false;
    return;
  }
  // Không có session = Supabase đang bật "Confirm email"
  if (!data.session) {
    toast("Đã đăng ký. Hãy kiểm tra email để xác nhận rồi đăng nhập.");
    btn.disabled = false;
    return;
  }
  const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).single();
  if (!profile) {
    toast("Không tạo được hồ sơ. Hãy thử lại.", "error");
    btn.disabled = false;
    return;
  }
  // Chọn giáo viên nhưng nhập sai mã -> tài khoản vẫn được tạo nhưng là học sinh
  if (role === "teacher" && profile.role !== "teacher") {
    toast("Mã giáo viên không đúng. Tài khoản được tạo với vai trò học sinh.", "error");
    setTimeout(() => location.replace(trangChu(profile.role)), 2200);
    return;
  }
  location.replace(trangChu(profile.role));
});
