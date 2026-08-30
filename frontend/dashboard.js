const API_BASE_URL = "http://127.0.0.1:8000";
const token = localStorage.getItem("access_token");
const currentUser = JSON.parse(localStorage.getItem("current_user") || "null");

const userGreeting = document.querySelector("#user-greeting");
const logoutButton = document.querySelector("#logout-button");
const workGrid = document.querySelector("#work-grid");
const emptyState = document.querySelector("#empty-state");
const errorState = document.querySelector("#error-state");
const workCount = document.querySelector("#work-count");
const latestWork = document.querySelector("#latest-work");
const searchInput = document.querySelector("#work-search");
const dialog = document.querySelector("#work-dialog");
const workForm = document.querySelector("#work-form");
const dialogMessage = document.querySelector("#dialog-message");
const createWorkSubmit = document.querySelector("#create-work-submit");

if (!token || !currentUser) {
  window.location.href = "./index.html";
}

userGreeting.textContent = `你好，${currentUser?.nickname || ""}`;
logoutButton.textContent = currentUser?.nickname?.slice(0, 1) || "我";

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

function showError(text) {
  errorState.textContent = text;
  errorState.classList.remove("hidden");
}

function renderWorks(works) {
  const keyword = searchInput.value.trim().toLowerCase();
  const filtered = works.filter((work) => {
    const haystack = `${work.title} ${work.category || ""} ${work.summary}`.toLowerCase();
    return haystack.includes(keyword);
  });
  workGrid.innerHTML = filtered.map((work) => `
    <article class="work-card">
      <div class="work-card-top">
        <h3 class="work-title">${escapeHtml(work.title)}</h3>
        ${work.category ? `<span class="work-category">${escapeHtml(work.category)}</span>` : ""}
      </div>
      <p class="work-summary">${escapeHtml(work.summary || "还没有简介，先从第一章开始吧。")}</p>
      <div class="work-meta">最近编辑 · ${formatDate(work.updated_at)}</div>
    </article>
  `).join("");
  emptyState.classList.toggle("hidden", filtered.length !== 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleDateString("zh-CN");
}

async function loadWorks() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${currentUser.id}/works`, {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "./index.html";
      return;
    }
    if (!response.ok) throw new Error("暂时无法读取作品列表。");
    const works = await response.json();
    workCount.textContent = works.length;
    latestWork.textContent = works[0]?.title || "暂无";
    renderWorks(works);
    searchInput.addEventListener("input", () => renderWorks(works));
  } catch (error) {
    showError(error.message);
  }
}

document.querySelector("#new-work-button").addEventListener("click", () => {
  dialogMessage.textContent = "";
  workForm.reset();
  dialog.showModal();
});

workForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  dialogMessage.textContent = "";
  createWorkSubmit.disabled = true;
  createWorkSubmit.textContent = "正在创建...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${currentUser.id}/works`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: document.querySelector("#work-title").value.trim(),
        category: document.querySelector("#work-category").value.trim() || null,
        summary: document.querySelector("#work-summary").value.trim(),
        writing_style: "",
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "创建作品失败。");
    dialog.close();
    await loadWorks();
  } catch (error) {
    dialogMessage.textContent = error.message;
  } finally {
    createWorkSubmit.disabled = false;
    createWorkSubmit.textContent = "创建作品";
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("current_user");
  window.location.href = "./index.html";
});

document.querySelector("#notes-link").addEventListener("click", (event) => {
  event.preventDefault();
  showError("随笔面板将在作品工作台之后接入。");
});

document.querySelector("#history-link").addEventListener("click", (event) => {
  event.preventDefault();
  showError("阅读历史模块将在书库数据接入后开放。");
});

loadWorks();
