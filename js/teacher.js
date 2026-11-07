// =====================================================================
// FILE: js/teacher.js - Xử lý trang giáo viên (KHÔNG CẦN SỬA)
// Gồm 3 phần: LỚP HỌC, NGÂN HÀNG CÂU HỎI, BÀI TẬP
// =====================================================================
import { sb } from "./supabase.js";
import { esc, renderMath, toast, friendlyError, requireUser, logout, fmtDate } from "./common.js";

// Bắt buộc đăng nhập đúng vai trò giáo viên, nếu không sẽ bị chuyển trang
const { user, profile } = await requireUser("teacher");
const $ = (id) => document.getElementById(id);
const LET = ["A", "B", "C", "D"];
let classes = [];
let questions = [];

$("ten-nguoi-dung").textContent = profile.full_name;
$("btn-logout").onclick = logout;

/* ---------- Chuyển tab ---------- */
const loaders = { lop: loadClasses, cauhoi: loadQuestions, baitap: loadAssignmentsTab };
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== "panel-" + name));
  loaders[name]();
}

/* =====================================================================
   PHẦN 1. LỚP HỌC
   ===================================================================== */
async function loadClasses() {
  const { data, error } = await sb
    .from("classes")
    .select("id,name,code,created_at,class_members(count)")
    .order("created_at", { ascending: false });
  if (error) return toast(friendlyError(error), "error");
  classes = data;
  $("chi-tiet-lop").innerHTML = "";
  $("ds-lop").innerHTML = data.length
    ? data.map((c) => `
      <div class="card">
        <div class="row between">
          <div>
            <strong>${esc(c.name)}</strong>
            <div class="muted">Mã lớp: <span class="code">${esc(c.code)}</span> · ${c.class_members?.[0]?.count ?? 0} học sinh</div>
          </div>
          <button class="btn small ghost" data-xem="${c.id}" type="button">Xem học sinh</button>
        </div>
      </div>`).join("")
    : `<p class="muted">Chưa có lớp nào. Hãy tạo lớp đầu tiên.</p>`;
  document.querySelectorAll("[data-xem]").forEach((b) => (b.onclick = () => xemHocSinh(b.dataset.xem)));
}

// Xem danh sách học sinh của một lớp
async function xemHocSinh(classId) {
  const lop = classes.find((c) => c.id === classId);
  const { data, error } = await sb
    .from("class_members")
    .select("joined_at,profiles(full_name)")
    .eq("class_id", classId)
    .order("joined_at");
  if (error) return toast(friendlyError(error), "error");
  $("chi-tiet-lop").innerHTML = `
    <div class="card">
      <h3>Học sinh lớp ${esc(lop?.name)}</h3>
      ${data.length ? `<div class="table-wrap"><table class="table">
        <tr><th>STT</th><th>Họ và tên</th><th>Ngày tham gia</th></tr>
        ${data.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.profiles?.full_name)}</td><td>${fmtDate(m.joined_at)}</td></tr>`).join("")}
      </table></div>` : `<p class="muted">Chưa có học sinh nào tham gia. Hãy gửi mã lớp cho học sinh.</p>`}
    </div>`;
  $("chi-tiet-lop").scrollIntoView({ behavior: "smooth" });
}

// Tạo lớp mới: tự sinh mã 6 ký tự (bỏ các ký tự dễ nhầm như 0/O, 1/I)
$("form-tao-lop").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("ten-lop").value.trim();
  if (!name) return toast("Hãy nhập tên lớp.", "error");
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 5; i++) {
    let code = "";
    for (let k = 0; k < 6; k++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    const { error } = await sb.from("classes").insert({ teacher_id: user.id, name, code });
    if (!error) {
      $("ten-lop").value = "";
      toast("Đã tạo lớp.");
      return loadClasses();
    }
    if (error.code !== "23505") return toast(friendlyError(error), "error"); // 23505 = trùng mã, thử lại
  }
  toast("Không tạo được mã lớp, hãy thử lại.", "error");
};

/* =====================================================================
   PHẦN 2. NGÂN HÀNG CÂU HỎI
   ===================================================================== */

// Ô "Xem trước": hiện câu hỏi + đáp án với công thức Toán đã dựng
function xemTruoc() {
  const el = $("xem-truoc");
  const opts = [0, 1, 2, 3].map((i) => `${LET[i]}. ${$("dapan-" + i).value}`).join("\n");
  el.textContent = ($("noidung").value || "") + "\n\n" + opts;
  renderMath(el);
}
["noidung", "dapan-0", "dapan-1", "dapan-2", "dapan-3"].forEach((id) => $(id).addEventListener("input", xemTruoc));

// Lưu câu hỏi mới
$("form-cauhoi").onsubmit = async (e) => {
  e.preventDefault();
  const content = $("noidung").value.trim();
  const options = [0, 1, 2, 3].map((i) => $("dapan-" + i).value.trim());
  if (!content || options.some((o) => !o)) return toast("Hãy nhập đủ nội dung và 4 đáp án.", "error");
  const { error } = await sb.from("questions").insert({
    teacher_id: user.id,
    content,
    options,
    correct_index: Number($("dapan-dung").value),
    explanation: $("loigiai").value.trim(),
  });
  if (error) return toast(friendlyError(error), "error");
  $("form-cauhoi").reset();
  xemTruoc();
  toast("Đã lưu câu hỏi.");
  loadQuestions();
};

// Hiện danh sách câu hỏi (đáp án đúng tô xanh lá)
async function loadQuestions() {
  const { data, error } = await sb.from("questions").select("*").order("created_at", { ascending: false });
  if (error) return toast(friendlyError(error), "error");
  questions = data;
  const el = $("ds-cauhoi");
  el.innerHTML = data.length
    ? data.map((q) => `
      <div class="card">
        <div class="qtext">${esc(q.content)}</div>
        ${q.options.map((o, k) => `<div class="opt ${k === q.correct_index ? "correct" : ""}">${LET[k]}. ${esc(o)}</div>`).join("")}
        ${q.explanation ? `<div class="muted qtext">Lời giải: ${esc(q.explanation)}</div>` : ""}
        <div class="row" style="margin-top:8px"><button class="btn small ghost" data-xoa="${q.id}" type="button">Xóa</button></div>
      </div>`).join("")
    : `<p class="muted">Chưa có câu hỏi nào.</p>`;
  renderMath(el);
  el.querySelectorAll("[data-xoa]").forEach((b) => (b.onclick = () => xoaCauHoi(b.dataset.xoa)));
}

// Xóa câu hỏi (không xóa được nếu đã dùng trong bài tập)
async function xoaCauHoi(id) {
  if (!confirm("Xóa câu hỏi này?")) return;
  const { error } = await sb.from("questions").delete().eq("id", id);
  if (error) {
    return toast(error.code === "23503" ? "Câu hỏi đang được dùng trong bài tập, không xóa được." : friendlyError(error), "error");
  }
  toast("Đã xóa câu hỏi.");
  loadQuestions();
}

/* =====================================================================
   PHẦN 3. BÀI TẬP
   ===================================================================== */
async function loadAssignmentsTab() {
  const [c, q, a] = await Promise.all([
    sb.from("classes").select("id,name").order("created_at", { ascending: false }),
    sb.from("questions").select("id,content").order("created_at", { ascending: false }),
    sb.from("assignments")
      .select("id,title,created_at,classes(name),assignment_questions(count),submissions(count)")
      .order("created_at", { ascending: false }),
  ]);
  const loi = c.error || q.error || a.error;
  if (loi) return toast(friendlyError(loi), "error");

  // Ô chọn lớp
  $("bt-lop").innerHTML = c.data.length
    ? c.data.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")
    : `<option value="">(Chưa có lớp)</option>`;

  // Danh sách câu hỏi để tick chọn
  const chon = $("bt-chon-cauhoi");
  chon.innerHTML = q.data.length
    ? q.data.map((x) => `<label class="option"><input type="checkbox" value="${x.id}"><span class="qtext">${esc(x.content)}</span></label>`).join("")
    : `<p class="muted">Chưa có câu hỏi. Hãy thêm ở tab "Ngân hàng câu hỏi".</p>`;
  renderMath(chon);

  // Danh sách bài đã giao
  $("ket-qua").innerHTML = "";
  $("ds-baitap").innerHTML = a.data.length
    ? a.data.map((x) => `
      <div class="card">
        <div class="row between">
          <div>
            <strong>${esc(x.title)}</strong>
            <div class="muted">Lớp ${esc(x.classes?.name)} · ${x.assignment_questions?.[0]?.count ?? 0} câu · ${x.submissions?.[0]?.count ?? 0} bài đã nộp · ${fmtDate(x.created_at)}</div>
          </div>
          <div class="row">
            <button class="btn small ghost" data-kq="${x.id}" data-ten="${esc(x.title)}" type="button">Xem kết quả</button>
            <button class="btn small ghost" data-xoabt="${x.id}" type="button">Xóa</button>
          </div>
        </div>
      </div>`).join("")
    : `<p class="muted">Chưa giao bài nào.</p>`;
  document.querySelectorAll("[data-kq]").forEach((b) => (b.onclick = () => xemKetQua(b.dataset.kq, b.dataset.ten)));
  document.querySelectorAll("[data-xoabt]").forEach((b) => (b.onclick = () => xoaBaiTap(b.dataset.xoabt)));
}

// Giao bài: tạo bài tập, rồi gắn các câu hỏi đã tick vào bài
$("form-baitap").onsubmit = async (e) => {
  e.preventDefault();
  const classId = $("bt-lop").value;
  const title = $("bt-tieude").value.trim();
  const ids = [...document.querySelectorAll("#bt-chon-cauhoi input:checked")].map((i) => i.value);
  if (!classId) return toast("Hãy tạo lớp trước.", "error");
  if (!title) return toast("Hãy nhập tên bài tập.", "error");
  if (!ids.length) return toast("Hãy chọn ít nhất 1 câu hỏi.", "error");

  const { data: a, error } = await sb
    .from("assignments")
    .insert({ class_id: classId, teacher_id: user.id, title })
    .select("id")
    .single();
  if (error) return toast(friendlyError(error), "error");

  const rows = ids.map((qid, i) => ({ assignment_id: a.id, question_id: qid, thu_tu: i + 1 }));
  const { error: e2 } = await sb.from("assignment_questions").insert(rows);
  if (e2) {
    await sb.from("assignments").delete().eq("id", a.id); // lỗi giữa chừng thì hủy bài vừa tạo
    return toast(friendlyError(e2), "error");
  }
  $("bt-tieude").value = "";
  toast("Đã giao bài.");
  loadAssignmentsTab();
};

// Xem kết quả cả lớp của một bài tập (BƯỚC 5):
// hiện tổng hợp (đã nộp, điểm TB, cao nhất, thấp nhất) và bảng từng học sinh,
// kể cả học sinh CHƯA nộp.
async function xemKetQua(id, ten) {
  const { data: bt, error: e0 } = await sb
    .from("assignments")
    .select("class_id,classes(name)")
    .eq("id", id)
    .single();
  if (e0) return toast(friendlyError(e0), "error");

  const [m, s] = await Promise.all([
    sb.from("class_members").select("student_id,profiles(full_name)").eq("class_id", bt.class_id),
    sb.from("submissions").select("student_id,score,total,submitted_at").eq("assignment_id", id),
  ]);
  if (m.error || s.error) return toast(friendlyError(m.error || s.error), "error");

  const nop = new Map(s.data.map((x) => [x.student_id, x]));
  const dong = m.data
    .map((x) => ({ ten: x.profiles?.full_name || "", sub: nop.get(x.student_id) }))
    .sort((a, b) => a.ten.localeCompare(b.ten, "vi"));

  const diem10 = (sub) => (sub.total ? (sub.score / sub.total) * 10 : 0); // quy về thang 10
  const so = (n) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  const daNop = dong.filter((d) => d.sub);
  const dsDiem = daNop.map((d) => diem10(d.sub));
  const tb = dsDiem.length ? dsDiem.reduce((a, b) => a + b, 0) / dsDiem.length : null;

  $("ket-qua").innerHTML = `
    <div class="card">
      <h3>Kết quả: ${esc(ten)} (lớp ${esc(bt.classes?.name)})</h3>
      <div class="grid-2" style="margin-bottom:12px">
        <div class="card soft" style="margin:0">Đã nộp: <strong>${daNop.length}/${dong.length}</strong></div>
        <div class="card soft" style="margin:0">Điểm trung bình: <strong>${tb === null ? "–" : so(tb) + "/10"}</strong></div>
        <div class="card soft" style="margin:0">Cao nhất: <strong>${dsDiem.length ? so(Math.max(...dsDiem)) + "/10" : "–"}</strong></div>
        <div class="card soft" style="margin:0">Thấp nhất: <strong>${dsDiem.length ? so(Math.min(...dsDiem)) + "/10" : "–"}</strong></div>
      </div>
      ${dong.length ? `<div class="table-wrap"><table class="table">
        <tr><th>STT</th><th>Học sinh</th><th>Số câu đúng</th><th>Điểm (thang 10)</th><th>Nộp lúc</th></tr>
        ${dong.map((d, i) => d.sub
          ? `<tr><td>${i + 1}</td><td>${esc(d.ten)}</td><td>${d.sub.score}/${d.sub.total}</td><td>${so(diem10(d.sub))}</td><td>${new Date(d.sub.submitted_at).toLocaleString("vi-VN")}</td></tr>`
          : `<tr><td>${i + 1}</td><td>${esc(d.ten)}</td><td colspan="3" class="muted">Chưa nộp</td></tr>`).join("")}
      </table></div>` : `<p class="muted">Lớp này chưa có học sinh.</p>`}
    </div>`;
  $("ket-qua").scrollIntoView({ behavior: "smooth" });
}

// Xóa bài tập (kết quả học sinh của bài đó cũng bị xóa)
async function xoaBaiTap(id) {
  if (!confirm("Xóa bài tập này? Kết quả của học sinh cũng sẽ bị xóa.")) return;
  const { error } = await sb.from("assignments").delete().eq("id", id);
  if (error) return toast(friendlyError(error), "error");
  toast("Đã xóa bài tập.");
  loadAssignmentsTab();
}

// Mở trang là hiện tab "Lớp học" đầu tiên
showTab("lop");
