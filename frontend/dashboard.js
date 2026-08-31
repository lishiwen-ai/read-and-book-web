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
const workspaceLink = document.querySelector("#workspace-link");
const notesLink = document.querySelector("#notes-link");
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
const noteWorkOptions = document.querySelector("#note-work-options");
const noteDialogMessage = document.querySelector("#note-dialog-message");
const saveNoteSubmit = document.querySelector("#save-note-submit");
let pendingWorkDeletion = null;
let works = [];
let notes = [];
let editingNoteId = null;
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
  collectionHeading.classList.toggle("hidden", notesView);
  workGrid.classList.toggle("hidden", notesView);
  emptyState.classList.toggle("hidden", notesView || workGrid.children.length !== 0);
  notesSection.classList.toggle("hidden", !notesView);
  workspaceLink.classList.toggle("active", !notesView);
  notesLink.classList.toggle("active", notesView);
  if (!notesView) errorState.classList.add("hidden");
}

function parseTags(value) {
  return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function renderNoteWorkOptions(selectedIds = []) {
  const selected = new Set(selectedIds);
  if (!works.length) {
    noteWorkOptions.innerHTML = `<span class="note-option-empty">暂无作品可关联</span>`;
    return;
  }
  noteWorkOptions.innerHTML = works.map((work) => `
    <label class="note-work-option">
      <input type="checkbox" value="${work.id}" ${selected.has(work.id) ? "checked" : ""} />
      <span>${escapeHtml(work.title)}</span>
    </label>
  `).join("");
}

function workTitleById(workId) {
  return works.find((work) => work.id === workId)?.title || "未命名作品";
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
        <span>${note.work_ids.length ? note.work_ids.map(workTitleById).map(escapeHtml).join(" · ") : "未关联作品"}</span>
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
  renderNoteWorkOptions(note?.work_ids || []);
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
    renderNoteWorkOptions();
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

document.querySelector("#history-link").addEventListener("click", (event) => {
  event.preventDefault();
  showError("阅读历史模块将在书库数据接入后开放。");
});

newNoteButton.addEventListener("click", () => openNoteDialog());
closeNoteDialog.addEventListener("click", () => noteDialog.close());
noteDialog.addEventListener("cancel", () => noteDialog.close());
noteSearch.addEventListener("input", renderNotes);
noteTagFilter.addEventListener("input", renderNotes);

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: noteTitle.value.trim(),
    content: noteContent.value.trim(),
    tags: parseTags(noteTags.value),
    work_ids: [...noteWorkOptions.querySelectorAll("input:checked")].map((input) => input.value),
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
