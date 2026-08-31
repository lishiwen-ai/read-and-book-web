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
const collectionHeading = document.querySelector("#collection-heading");
const notesSection = document.querySelector("#notes-section");
const historySection = document.querySelector("#history-section");
const workspaceLink = document.querySelector("#workspace-link");
const notesLink = document.querySelector("#notes-link");
const historyLink = document.querySelector("#history-link");
const newNoteButton = document.querySelector("#new-note-button");
const noteSearch = document.querySelector("#note-search");
const noteTagFilter = document.querySelector("#note-tag-filter");
const noteList = document.querySelector("#note-list");
const notesEmptyState = document.querySelector("#notes-empty-state");
const noteDialog = document.querySelector("#note-dialog");
const noteForm = document.querySelector("#note-form");
const noteDialogTitle = document.querySelector("#note-dialog-title");
const closeNoteDialog = document.querySelector("#close-note-dialog");
const noteTitle = document.querySelector("#note-title");
const noteContent = document.querySelector("#note-content");
const noteTags = document.querySelector("#note-tags");
const noteDialogMessage = document.querySelector("#note-dialog-message");
const saveNoteSubmit = document.querySelector("#save-note-submit");
const newReadingButton = document.querySelector("#new-reading-button");
const historySearch = document.querySelector("#history-search");
const historyStatusFilter = document.querySelector("#history-status-filter");
const historyList = document.querySelector("#history-list");
const historyEmptyState = document.querySelector("#history-empty-state");
const readingDialog = document.querySelector("#reading-dialog");
const readingForm = document.querySelector("#reading-form");
const readingDialogTitle = document.querySelector("#reading-dialog-title");
const closeReadingDialog = document.querySelector("#close-reading-dialog");
const readingTitle = document.querySelector("#reading-title");
const readingAuthor = document.querySelector("#reading-author");
const readingCategory = document.querySelector("#reading-category");
const readingStatus = document.querySelector("#reading-status");
const readingTotalPages = document.querySelector("#reading-total-pages");
const readingCurrentPage = document.querySelector("#reading-current-page");
const readingNotes = document.querySelector("#reading-notes");
const readingDialogMessage = document.querySelector("#reading-dialog-message");
const saveReadingSubmit = document.querySelector("#save-reading-submit");
let pendingWorkDeletion = null;
let works = [];
let notes = [];
let readingHistory = [];
let editingNoteId = null;
let editingReadingId = null;
const closeDialogButton = document.querySelector("#close-work-dialog");
const aiSettingsButton = document.querySelector("#ai-settings-button");
const aiSettingsDialog = document.querySelector("#ai-settings-dialog");
const aiSettingsForm = document.querySelector("#ai-settings-form");
const closeAiSettings = document.querySelector("#close-ai-settings");
const deepseekApiKey = document.querySelector("#deepseek-api-key");
const deepseekModel = document.querySelector("#deepseek-model");
const testAiKeyButton = document.querySelector("#test-ai-key");
const aiSettingsStatus = document.querySelector("#ai-settings-status");
const deleteAiKey = document.querySelector("#delete-ai-key");
const saveAiKey = document.querySelector("#save-ai-key");
let aiState = {
  configured: false,
  model: "deepseek-chat",
  availableModels: [],
  validated: false,
};

if (!token || !currentUser) {
  window.location.href = "./index.html";
}

userGreeting.textContent = `你好，${currentUser?.nickname || ""}`;
logoutButton.textContent = currentUser?.nickname?.slice(0, 1) || "我";

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function loadAiSettings() {
  aiSettingsStatus.textContent = "正在读取配置...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/ai`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "无法读取 AI 配置。");
    aiState.configured = data.configured;
    aiState.model = data.model || "deepseek-chat";
    aiState.availableModels = data.available_models || [];
    aiState.validated = data.configured;
    deepseekApiKey.value = "";
    syncModelOptions(data.available_models || [], data.configured ? aiState.model : "", data.configured ? "已保存的模型" : "请先检测密钥");
    aiSettingsStatus.textContent = data.configured ? `已配置，当前模型：${aiState.model}` : "尚未配置 DeepSeek 密钥";
    deleteAiKey.disabled = !data.configured;
    saveAiKey.disabled = !data.configured;
  } catch (error) {
    aiSettingsStatus.textContent = error.message;
  }
}

function syncModelOptions(models, selectedModel, placeholderText = "请先检测密钥") {
  const uniqueModels = [...new Set(models.filter(Boolean))];
  const options = uniqueModels.length ? uniqueModels : (selectedModel ? [selectedModel] : []);
  if (!options.length) {
    deepseekModel.innerHTML = `<option value="">${placeholderText}</option>`;
    deepseekModel.disabled = true;
    return;
  }
  if (selectedModel && !options.includes(selectedModel)) options.unshift(selectedModel);
  deepseekModel.innerHTML = options.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
  deepseekModel.value = selectedModel && options.includes(selectedModel) ? selectedModel : options[0];
  deepseekModel.disabled = false;
}

async function validateAiKey() {
  const apiKey = deepseekApiKey.value.trim();
  aiSettingsStatus.textContent = "正在检测密钥...";
  testAiKeyButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/ai/test`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey || null }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "密钥无效。");
    aiState.validated = true;
    aiState.availableModels = data.available_models || [];
    aiState.model = data.model || aiState.model;
    syncModelOptions(aiState.availableModels, aiState.model, "未获取到可用模型");
    aiSettingsStatus.textContent = `密钥有效，已加载 ${aiState.availableModels.length} 个模型`;
    deleteAiKey.disabled = false;
    saveAiKey.disabled = false;
  } catch (error) {
    aiState.validated = false;
    aiSettingsStatus.textContent = error.message;
  } finally {
    testAiKeyButton.disabled = false;
  }
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

function showWorkspaceView(view) {
  const notesView = view === "notes";
  const historyView = view === "history";
  collectionHeading.classList.toggle("hidden", notesView || historyView);
  workGrid.classList.toggle("hidden", notesView || historyView);
  emptyState.classList.toggle("hidden", notesView || historyView || workGrid.children.length !== 0);
  notesSection.classList.toggle("hidden", !notesView);
  historySection.classList.toggle("hidden", !historyView);
  workspaceLink.classList.toggle("active", !notesView && !historyView);
  notesLink.classList.toggle("active", notesView);
  historyLink.classList.toggle("active", historyView);
  if (!notesView) errorState.classList.add("hidden");
}

function parseTags(value) {
  return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function renderNotes() {
  const keyword = noteSearch.value.trim().toLowerCase();
  const tagKeyword = noteTagFilter.value.trim().toLowerCase();
  const filtered = notes.filter((note) => {
    const matchesText = `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(keyword);
    const matchesTag = !tagKeyword || note.tags.some((tag) => tag.toLowerCase().includes(tagKeyword));
    return matchesText && matchesTag;
  });
  noteList.innerHTML = filtered.map((note) => `
    <article class="note-card" data-note-id="${note.id}" tabindex="0" role="link" aria-label="打开随笔：${escapeHtml(note.title)}">
      <div class="note-card-heading">
        <div>
          <h3>${escapeHtml(note.title)}</h3>
          <div class="note-tags">${note.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
        <div class="note-actions">
          <button class="note-edit-button" type="button" data-note-id="${note.id}" title="编辑随笔" aria-label="编辑随笔">编辑</button>
          <button class="note-delete-button" type="button" data-note-id="${note.id}" title="删除随笔" aria-label="删除随笔">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>
          </button>
        </div>
      </div>
      <p class="note-content">${escapeHtml(note.content)}</p>
      <div class="note-card-footer">
        <button class="note-open-button" type="button" data-note-id="${note.id}">打开随笔 <span>→</span></button>
      </div>
    </article>
  `).join("");
  notesEmptyState.classList.toggle("hidden", filtered.length !== 0);
  noteList.querySelectorAll(".note-edit-button").forEach((button) => {
    button.addEventListener("click", () => openNoteDialog(notes.find((note) => note.id === button.dataset.noteId)));
  });
  noteList.querySelectorAll(".note-delete-button").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.noteId));
  });
  noteList.querySelectorAll(".note-open-button").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `./note-editor.html?note_id=${encodeURIComponent(button.dataset.noteId)}`;
    });
  });
  noteList.querySelectorAll(".note-card").forEach((card) => {
    const open = () => {
      window.location.href = `./note-editor.html?note_id=${encodeURIComponent(card.dataset.noteId)}`;
    };
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button")) open();
    });
    card.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
        event.preventDefault();
        open();
      }
    });
  });
}

const readingStatusLabels = {
  planned: "待读",
  reading: "在读",
  completed: "已读完",
  paused: "暂时搁置",
};

function renderReadingHistory() {
  const keyword = historySearch.value.trim().toLowerCase();
  const status = historyStatusFilter.value;
  const filtered = readingHistory.filter((item) => {
    const haystack = `${item.title} ${item.author} ${item.category} ${item.notes}`.toLowerCase();
    return haystack.includes(keyword) && (!status || item.status === status);
  });
  historyList.innerHTML = filtered.map((item) => {
    const progress = item.total_pages > 0
      ? Math.min(100, Math.round((item.current_page / item.total_pages) * 100))
      : 0;
    const progressText = item.total_pages > 0
      ? `${item.current_page} / ${item.total_pages} 页`
      : `已读 ${item.current_page} 页`;
    return `
      <article class="history-card">
        <div class="history-card-heading">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="history-author">${escapeHtml(item.author || "作者未填写")}${item.category ? ` · ${escapeHtml(item.category)}` : ""}</p>
          </div>
          <div class="history-actions">
            <span class="history-status ${escapeHtml(item.status)}">${readingStatusLabels[item.status] || "阅读中"}</span>
            <button class="history-edit-button" type="button" data-reading-id="${item.id}" title="编辑阅读记录">编辑</button>
            <button class="history-delete-button" type="button" data-reading-id="${item.id}" aria-label="删除阅读记录" title="删除阅读记录">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>
            </button>
          </div>
        </div>
        <div class="history-progress">
          <div class="history-progress-line"><span>阅读进度</span><strong>${progressText} · ${progress}%</strong></div>
          <div class="history-progress-track" aria-label="阅读进度 ${progress}%"><div class="history-progress-value" style="width:${progress}%"></div></div>
        </div>
        ${item.notes ? `<p class="history-card-note">${escapeHtml(item.notes)}</p>` : ""}
        <div class="history-card-footer">最近阅读 · ${formatDateTime(item.last_read_at)}</div>
      </article>
    `;
  }).join("");
  historyEmptyState.classList.toggle("hidden", filtered.length !== 0);
  historyList.querySelectorAll(".history-edit-button").forEach((button) => {
    button.addEventListener("click", () => openReadingDialog(readingHistory.find((item) => item.id === button.dataset.readingId)));
  });
  historyList.querySelectorAll(".history-delete-button").forEach((button) => {
    button.addEventListener("click", () => deleteReadingHistory(button.dataset.readingId));
  });
}

async function loadNotes() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "暂时无法读取随笔。");
    notes = data;
    renderNotes();
  } catch (error) {
    showError(error.message);
  }
}

function openNoteDialog(note = null) {
  editingNoteId = note?.id || null;
  noteDialogTitle.textContent = note ? "编辑随笔" : "记下一则随笔";
  noteTitle.value = note?.title || "";
  noteContent.value = note?.content || "";
  noteTags.value = note?.tags?.join("，") || "";
  noteDialogMessage.textContent = "";
  noteDialog.showModal();
  noteTitle.focus();
}

async function deleteNote(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note || !window.confirm(`确定删除随笔“${note.title}”？`)) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "删除随笔失败。");
    }
    notes = notes.filter((item) => item.id !== noteId);
    renderNotes();
  } catch (error) {
    showError(error.message);
  }
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

function formatDateTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
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
    works = await response.json();
    workCount.textContent = works.length;
    latestWork.textContent = works[0]?.title || "暂无";
    recentActivity.textContent = works.length ? "编辑作品" : "暂无记录";
    renderWorks(works);
  } catch (error) {
    showError(error.message);
  }
}

async function loadReadingHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/reading-history`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "暂时无法读取阅读历史。");
    readingHistory = data;
    renderReadingHistory();
  } catch (error) {
    showError(error.message);
  }
}

function openReadingDialog(item = null) {
  editingReadingId = item?.id || null;
  readingDialogTitle.textContent = item ? "编辑阅读记录" : "添加阅读记录";
  readingTitle.value = item?.title || "";
  readingAuthor.value = item?.author || "";
  readingCategory.value = item?.category || "";
  readingStatus.value = item?.status || "reading";
  readingTotalPages.value = item?.total_pages ? item.total_pages : "";
  readingCurrentPage.value = item?.current_page ?? 0;
  readingNotes.value = item?.notes || "";
  readingDialogMessage.textContent = "";
  readingDialog.showModal();
  readingTitle.focus();
}

async function deleteReadingHistory(readingId) {
  const item = readingHistory.find((entry) => entry.id === readingId);
  if (!item || !window.confirm(`确定删除《${item.title}》的阅读记录？`)) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/reading-history/${readingId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "删除阅读记录失败。");
    }
    readingHistory = readingHistory.filter((entry) => entry.id !== readingId);
    renderReadingHistory();
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

searchInput.addEventListener("input", () => renderWorks(works));

aiSettingsButton.addEventListener("click", () => {
  deepseekApiKey.value = "";
  aiState.validated = false;
  aiSettingsDialog.showModal();
  loadAiSettings().then(() => {
    if (aiState.configured) validateAiKey();
  });
});
closeAiSettings.addEventListener("click", () => aiSettingsDialog.close());
aiSettingsDialog.addEventListener("cancel", () => aiSettingsDialog.close());
deepseekApiKey.addEventListener("input", () => {
  aiState.validated = false;
  if (deepseekApiKey.value.trim()) {
    aiSettingsStatus.textContent = "输入完成后请检测密钥有效性。";
  }
});
testAiKeyButton.addEventListener("click", validateAiKey);
aiSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = deepseekApiKey.value.trim();
  const model = deepseekModel.value.trim();
  if (!model) {
    aiSettingsStatus.textContent = "请先选择一个模型。";
    return;
  }
  if (apiKey && !aiState.validated) {
    aiSettingsStatus.textContent = "请先检测密钥有效性。";
    return;
  }
  saveAiKey.disabled = true;
  saveAiKey.textContent = "保存中...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/ai`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey || null, model }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存 AI 密钥失败。");
    deepseekApiKey.value = "";
    aiState.configured = true;
    aiState.model = data.model || model;
    aiState.availableModels = data.available_models || aiState.availableModels;
    aiState.validated = true;
    syncModelOptions(aiState.availableModels, aiState.model, "已保存");
    aiSettingsStatus.textContent = `${data.provider} 设置已保存`;
    deleteAiKey.disabled = false;
  } catch (error) {
    aiSettingsStatus.textContent = error.message;
  } finally {
    saveAiKey.disabled = false;
    saveAiKey.textContent = "保存设置";
  }
});
deleteAiKey.addEventListener("click", async () => {
  if (deleteAiKey.disabled) return;
  deleteAiKey.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings/ai`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "删除 AI 密钥失败。");
    }
    aiSettingsStatus.textContent = "DeepSeek 密钥已删除";
    aiState = { configured: false, model: "deepseek-chat", availableModels: [], validated: false };
    deepseekApiKey.value = "";
    syncModelOptions([], "", "请先检测密钥");
    saveAiKey.disabled = true;
  } catch (error) {
    aiSettingsStatus.textContent = error.message;
    deleteAiKey.disabled = false;
  }
});

notesLink.addEventListener("click", (event) => {
  event.preventDefault();
  showWorkspaceView("notes");
  loadNotes();
});

workspaceLink.addEventListener("click", (event) => {
  event.preventDefault();
  showWorkspaceView("works");
  renderWorks(works);
});

historyLink.addEventListener("click", (event) => {
  event.preventDefault();
  showWorkspaceView("history");
  loadReadingHistory();
});

newNoteButton.addEventListener("click", () => openNoteDialog());
closeNoteDialog.addEventListener("click", () => noteDialog.close());
noteDialog.addEventListener("cancel", () => noteDialog.close());
noteSearch.addEventListener("input", renderNotes);
noteTagFilter.addEventListener("input", renderNotes);
historySearch.addEventListener("input", renderReadingHistory);
historyStatusFilter.addEventListener("change", renderReadingHistory);

newReadingButton.addEventListener("click", () => openReadingDialog());
closeReadingDialog.addEventListener("click", () => readingDialog.close());
readingDialog.addEventListener("cancel", () => readingDialog.close());

readingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const totalPages = Number.parseInt(readingTotalPages.value, 10) || 0;
  const currentPage = Number.parseInt(readingCurrentPage.value, 10) || 0;
  const payload = {
    title: readingTitle.value.trim(),
    author: readingAuthor.value.trim(),
    category: readingCategory.value.trim(),
    total_pages: totalPages,
    current_page: currentPage,
    status: readingStatus.value,
    notes: readingNotes.value.trim(),
  };
  if (!payload.title) {
    readingDialogMessage.textContent = "请填写书名。";
    return;
  }
  if (currentPage > totalPages && totalPages > 0) {
    readingDialogMessage.textContent = "当前页不能超过总页数。";
    return;
  }
  saveReadingSubmit.disabled = true;
  saveReadingSubmit.textContent = "保存中...";
  readingDialogMessage.textContent = "";
  try {
    const response = await fetch(
      editingReadingId ? `${API_BASE_URL}/api/reading-history/${editingReadingId}` : `${API_BASE_URL}/api/reading-history`,
      {
        method: editingReadingId ? "PATCH" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存阅读记录失败。");
    if (editingReadingId) {
      readingHistory = readingHistory.map((item) => item.id === data.id ? data : item);
    } else {
      readingHistory.unshift(data);
    }
    readingDialog.close();
    renderReadingHistory();
  } catch (error) {
    readingDialogMessage.textContent = error.message;
  } finally {
    saveReadingSubmit.disabled = false;
    saveReadingSubmit.textContent = "保存阅读记录";
  }
});

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: noteTitle.value.trim(),
    content: noteContent.value.trim(),
    tags: parseTags(noteTags.value),
  };
  if (!payload.title || !payload.content) {
    noteDialogMessage.textContent = "请填写标题和内容。";
    return;
  }
  saveNoteSubmit.disabled = true;
  saveNoteSubmit.textContent = "保存中...";
  noteDialogMessage.textContent = "";
  try {
    const response = await fetch(
      editingNoteId ? `${API_BASE_URL}/api/notes/${editingNoteId}` : `${API_BASE_URL}/api/notes`,
      {
        method: editingNoteId ? "PATCH" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存随笔失败。");
    if (editingNoteId) {
      notes = notes.map((note) => note.id === data.id ? data : note);
    } else {
      notes.unshift(data);
    }
    noteDialog.close();
    renderNotes();
  } catch (error) {
    noteDialogMessage.textContent = error.message;
  } finally {
    saveNoteSubmit.disabled = false;
    saveNoteSubmit.textContent = "保存随笔";
  }
});

loadWorks();
