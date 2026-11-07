// =====================================================================
// FILE: js/student.js - Xử lý trang học sinh (KHÔNG CẦN SỬA)
// Gồm: tham gia lớp bằng mã, xem bài tập, làm bài, nộp bài, xem kết quả
// =====================================================================
import { sb } from "./supabase.js";
import { esc, renderMath, toast, friendlyError, requireUser, logout, fmtDate } from "./common.js";

// Bắt buộc đăng nhập đúng vai trò học sinh, nếu không sẽ bị chuyển trang
const { user, profile } = await requireUser("student");
const $ = (id) => document.getElementById(id);
const LET = ["A", "B", "C", "D"];

// Đổi điểm sang thang 10, ví dụ 8 câu đúng / 10 câu -> "8"
const diem10 = (score, total) =>
  (total ? (score / total) * 10 : 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

$("ten-nguoi-dung").textContent = profile.full_name;
$("btn-logout").onclick = logout;

/* ---------- Chuyển tab ---------- */
const loaders = { lop: loadClasses, baitap: loadAssignments, ketqua: loadResults };
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== "panel-" + name));
  loaders[name]();
}

/* =====================================================================
   PHẦN 1. LỚP CỦA TÔI
   ===================================================================== */

// Tham gia lớp: gọi hàm join_class trên Supabase (xem schema.sql)
$("form-vao-lop").onsubmit = async (e) => {
  e.preventDefault();
  const code = $("ma-lop").value.trim();
  if (!code) return toast("Hãy nhập mã lớp.", "error");
  const { error } = await sb.rpc("join_class", { p_code: code });
  if (error) return toast(friendlyError(error), "error");
  $("ma-lop").value = "";
  toast("Đã tham gia lớp.");
  loadClasses();
};

// Danh sách lớp đã tham gia
async function loadClasses() {
  const { data, error } = await sb
    .from("class_members")
    .select("joined_at,classes(name,code)")
    .eq("student_id", user.id)
    .order("joined_at", { ascending: false });
  if (error) return toast(friendlyError(error), "error");
  $("ds-lop").innerHTML = data.length
    ? data.map((m) => `
      <div class="card">
        <strong>${esc(m.classes?.name)}</strong>
        <div class="muted">Mã lớp: <span class="code">${esc(m.classes?.code)}</span> · Tham gia ${fmtDate(m.joined_at)}</div>
      </div>`).join("")
    : `<p class="muted">Bạn chưa tham gia lớp nào. Hãy nhập mã lớp ở trên.</p>`;
}

/* =====================================================================
   PHẦN 2. BÀI TẬP
   ===================================================================== */

// Danh sách bài tập; bài đã nộp hiện điểm + nút "Xem lại"
async function loadAssignments() {
  $("khu-lam-bai").classList.add("hidden");
  $("ds-baitap").classList.remove("hidden");
  const [a, s] = await Promise.all([
    sb.from("assignments").select("id,title,created_at,classes(name)").order("created_at", { ascending: false }),
    sb.from("submissions").select("assignment_id,score,total").eq("student_id", user.id),
  ]);
  if (a.error || s.error) return toast(friendlyError(a.error || s.error), "error");
  const daNop = new Map(s.data.map((x) => [x.assignment_id, x]));

  $("ds-baitap").innerHTML = a.data.length
    ? a.data.map((x) => {
        const sub = daNop.get(x.id);
        return `
        <div class="card">
          <div class="row between">
            <div>
              <strong>${esc(x.title)}</strong>
              <div class="muted">Lớp ${esc(x.classes?.name)} · ${fmtDate(x.created_at)}</div>
              ${sub ? `<span class="badge">Đã nộp: ${sub.score}/${sub.total}</span>` : `<span class="badge">Chưa làm</span>`}
            </div>
            <button class="btn small ${sub ? "ghost" : ""}" data-id="${x.id}" data-ten="${esc(x.title)}" data-nop="${sub ? 1 : 0}" type="button">
              ${sub ? "Xem lại" : "Làm bài"}
            </button>
          </div>
        </div>`;
      }).join("")
    : `<p class="muted">Chưa có bài tập nào.</p>`;

  document.querySelectorAll("#ds-baitap [data-id]").forEach((b) => {
    b.onclick = () => (b.dataset.nop === "1" ? xemLai(b.dataset.id, b.dataset.ten) : lamBai(b.dataset.id, b.dataset.ten));
  });
}

// Ẩn danh sách, hiện khu làm bài / kết quả
function hienKhuLamBai(html) {
  $("ds-baitap").classList.add("hidden");
  const khu = $("khu-lam-bai");
  khu.classList.remove("hidden");
  khu.innerHTML = html;
  renderMath(khu);
  window.scrollTo({ top: 0 });
  khu.querySelector("[data-quaylai]").onclick = loadAssignments;
  return khu;
}

// Lấy câu hỏi của bài (không kèm đáp án đúng)
async function layCauHoi(id) {
  const { data, error } = await sb.rpc("get_assignment_questions", { p_assignment: id });
  if (error) {
    toast(friendlyError(error), "error");
    return null;
  }
  return data;
}

// Làm bài: hiện câu hỏi, học sinh chọn đáp án rồi bấm "Nộp bài"
async function lamBai(id, ten) {
  const cauHoi = await layCauHoi(id);
  if (!cauHoi) return;
  const khu = hienKhuLamBai(`
    <button class="btn small ghost" data-quaylai type="button">← Quay lại</button>
    <h2 style="margin-top:12px">${esc(ten)}</h2>
    ${cauHoi.map((q, i) => `
      <div class="card" data-q="${q.question_id}">
        <div class="qtext"><strong>Câu ${i + 1}.</strong> ${esc(q.content)}</div>
        ${q.options.map((o, k) => `
          <label class="option"><input type="radio" name="q${i}" value="${k}"><span class="qtext">${LET[k]}. ${esc(o)}</span></label>`).join("")}
      </div>`).join("")}
    <button id="btn-nop" class="btn full" type="button">Nộp bài</button>`);

  $("btn-nop").onclick = async () => {
    // Gom đáp án đã chọn: { mã_câu_hỏi: số_thứ_tự_đáp_án }
    const answers = {};
    khu.querySelectorAll("[data-q]").forEach((card) => {
      const chon = card.querySelector("input:checked");
      if (chon) answers[card.dataset.q] = Number(chon.value);
    });
    const chuaLam = cauHoi.length - Object.keys(answers).length;
    if (chuaLam > 0 && !confirm(`Bạn còn ${chuaLam} câu chưa trả lời. Vẫn nộp bài?`)) return;
    if (chuaLam === 0 && !confirm("Nộp bài? Bạn chỉ được nộp một lần.")) return;

    $("btn-nop").disabled = true;
    // Máy chủ tự chấm điểm và trả về kết quả
    const { data, error } = await sb.rpc("submit_assignment", { p_assignment: id, p_answers: answers });
    if (error) {
      $("btn-nop").disabled = false;
      return toast(friendlyError(error), "error");
    }
    hienKetQua(ten, cauHoi, data);
  };
}

// Xem lại bài đã nộp
async function xemLai(id, ten) {
  const [cauHoi, sub] = await Promise.all([
    layCauHoi(id),
    sb.from("submissions").select("result").eq("assignment_id", id).eq("student_id", user.id).single(),
  ]);
  if (!cauHoi) return;
  if (sub.error) return toast(friendlyError(sub.error), "error");
  hienKetQua(ten, cauHoi, sub.data.result);
}

// Hiện điểm, đáp án đúng (xanh), đáp án đã chọn sai (đỏ) và lời giải
function hienKetQua(ten, cauHoi, kq) {
  const chiTiet = new Map(kq.details.map((d) => [d.question_id, d]));
  hienKhuLamBai(`
    <button class="btn small ghost" data-quaylai type="button">← Quay lại danh sách</button>
    <h2 style="margin-top:12px">${esc(ten)}</h2>
    <div class="card soft"><strong>Điểm: ${kq.score}/${kq.total} câu đúng (${diem10(kq.score, kq.total)}/10)</strong></div>
    ${cauHoi.map((q, i) => {
      const d = chiTiet.get(q.question_id) || {};
      return `
      <div class="card">
        <div class="qtext"><strong>Câu ${i + 1}.</strong> ${esc(q.content)}</div>
        ${q.options.map((o, k) => {
          const cls = k === d.correct_index ? "correct" : k === d.chosen ? "wrong" : "";
          return `<div class="opt ${cls}">${LET[k]}. ${esc(o)}${k === d.chosen ? " (bạn chọn)" : ""}</div>`;
        }).join("")}
        ${d.chosen === null || d.chosen === undefined ? `<div class="muted">Bạn chưa trả lời câu này.</div>` : ""}
        ${d.explanation ? `<div class="muted qtext">Lời giải: ${esc(d.explanation)}</div>` : ""}
      </div>`;
    }).join("")}`);
}

/* =====================================================================
   PHẦN 3. KẾT QUẢ CỦA TÔI (BƯỚC 5)
   ===================================================================== */

// Danh sách tất cả bài đã nộp + điểm trung bình
async function loadResults() {
  const { data, error } = await sb
    .from("submissions")
    .select("assignment_id,score,total,submitted_at,assignments(title,classes(name))")
    .eq("student_id", user.id)
    .order("submitted_at", { ascending: false });
  if (error) return toast(friendlyError(error), "error");

  if (!data.length) {
    $("tong-ket").innerHTML = "";
    $("ds-ketqua").innerHTML = `<p class="muted">Bạn chưa nộp bài nào.</p>`;
    return;
  }
  const tb = data.reduce((t, x) => t + (x.total ? (x.score / x.total) * 10 : 0), 0) / data.length;
  $("tong-ket").innerHTML = `
    <div class="grid-2" style="margin-bottom:12px">
      <div class="card soft" style="margin:0">Số bài đã nộp: <strong>${data.length}</strong></div>
      <div class="card soft" style="margin:0">Điểm trung bình: <strong>${tb.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}/10</strong></div>
    </div>`;
  $("ds-ketqua").innerHTML = data.map((x) => `
    <div class="card">
      <div class="row between">
        <div>
          <strong>${esc(x.assignments?.title)}</strong>
          <div class="muted">Lớp ${esc(x.assignments?.classes?.name)} · ${new Date(x.submitted_at).toLocaleString("vi-VN")}</div>
          <span class="badge">${x.score}/${x.total} câu đúng · ${diem10(x.score, x.total)}/10</span>
        </div>
        <button class="btn small ghost" data-id="${x.assignment_id}" data-ten="${esc(x.assignments?.title)}" type="button">Xem chi tiết</button>
      </div>
    </div>`).join("");
  document.querySelectorAll("#ds-ketqua [data-id]").forEach((b) => {
    b.onclick = () => moBaiTap(b.dataset.id, b.dataset.ten);
  });
}

// Chuyển sang tab "Bài tập" và mở thẳng phần xem lại bài đã nộp
function moBaiTap(id, ten) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "baitap"));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== "panel-baitap"));
  xemLai(id, ten);
}

// Mở trang là hiện tab "Lớp của tôi" đầu tiên
showTab("lop");
