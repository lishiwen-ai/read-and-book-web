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
const recentActivity = document.querySelector("#recent-activity");
const searchInput = document.querySelector("#work-search");
const dialog = document.querySelector("#work-dialog");
const workForm = document.querySelector("#work-form");
const dialogMessage = document.querySelector("#dialog-message");
const createWorkSubmit = document.querySelector("#create-work-submit");
const deleteWorkDialog = document.querySelector("#delete-work-dialog");
const deleteWorkCopy = document.querySelector("#delete-work-copy");
const cancelDeleteWork = document.querySelector("#cancel-delete-work");
const confirmDeleteWork = document.querySelector("#confirm-delete-work");
let pendingWorkDeletion = null;
const closeDialogButton = document.querySelector("#close-work-dialog");

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
        <div class="work-actions">
          ${work.category ? `<span class="work-category">${escapeHtml(work.category)}</span>` : ""}
          <button class="delete-work-button" type="button" data-work-id="${work.id}" data-work-title="${escapeHtml(work.title)}" aria-label="删除 ${escapeHtml(work.title)}" title="删除作品">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>
          </button>
        </div>
      </div>
      <button class="open-work-button" type="button" data-work-id="${work.id}">打开作品 <span>→</span></button>
      <p class="work-summary">${escapeHtml(work.summary || "还没有简介，先从第一章开始吧。")}</p>
      <div class="work-meta">最近编辑 · ${formatDate(work.updated_at)}</div>
    </article>
  `).join("");
  emptyState.classList.toggle("hidden", filtered.length !== 0);
  workGrid.querySelectorAll(".delete-work-button").forEach((button) => {
    button.addEventListener("click", () => deleteWork(button.dataset.workId, button.dataset.workTitle));
  });
  workGrid.querySelectorAll(".open-work-button").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `./editor.html?work_id=${encodeURIComponent(button.dataset.workId)}`;
    });
  });
}

async function deleteWork(workId, workTitle) {
  const confirmed = await requestWorkDeletion(workId, workTitle);
  if (!confirmed) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/works/${workId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "删除作品失败。");
    }
    await loadWorks();
  } catch (error) {
    showError(error.message);
  }
}

function requestWorkDeletion(workId, workTitle) {
  pendingWorkDeletion = workId;
  deleteWorkCopy.textContent = `《${workTitle}》以及其中的章节会被删除，此操作无法撤销。`;
  deleteWorkDialog.showModal();
  return new Promise((resolve) => {
    deleteWorkDialog._resolveDeletion = resolve;
  });
}

function finishWorkDeletion(confirmed) {
  deleteWorkDialog.close();
  deleteWorkDialog._resolveDeletion?.(confirmed && pendingWorkDeletion);
  pendingWorkDeletion = null;
}

cancelDeleteWork.addEventListener("click", () => finishWorkDeletion(false));
confirmDeleteWork.addEventListener("click", () => finishWorkDeletion(true));
deleteWorkDialog.addEventListener("cancel", () => finishWorkDeletion(false));

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
    recentActivity.textContent = works.length ? "编辑作品" : "暂无记录";
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

closeDialogButton.addEventListener("click", () => {
  dialog.close();
});

dialog.addEventListener("cancel", () => {
  dialog.close();
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
