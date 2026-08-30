const API_BASE_URL = "http://127.0.0.1:8000";
const token = localStorage.getItem("access_token");
const user = JSON.parse(localStorage.getItem("current_user") || "null");
const workId = new URLSearchParams(window.location.search).get("work_id");

const workTitle = document.querySelector("#work-title");
const chapterList = document.querySelector("#chapter-list");
const chapterTitle = document.querySelector("#chapter-title");
const chapterContent = document.querySelector("#chapter-content");
const chapterStatus = document.querySelector("#chapter-status");
const wordCount = document.querySelector("#word-count");
const saveStatus = document.querySelector("#save-status");
const editorMessage = document.querySelector("#editor-message");
const sidebarMessage = document.querySelector("#sidebar-message");
const saveButton = document.querySelector("#save-chapter");
const deleteButton = document.querySelector("#delete-chapter");
let chapters = [];
let activeChapter = null;
let autoSaveTimer = null;
let saveInFlight = false;

if (!token || !user || !workId) window.location.href = "./dashboard.html";

function headers() { return { Authorization: `Bearer ${token}` }; }
function showMessage(target, text) { target.textContent = text; }
function updateWordCount() {
  wordCount.textContent = `${chapterContent.value.replace(/\s/g, "").length} 字`;
}

function setEditorAvailability(enabled) {
  chapterTitle.disabled = !enabled;
  chapterContent.disabled = !enabled;
  chapterStatus.disabled = !enabled;
  saveButton.disabled = !enabled;
  deleteButton.disabled = !enabled;
}

function renderChapters() {
  chapterList.innerHTML = chapters.map((chapter, index) => `
    <button class="chapter-item ${activeChapter?.id === chapter.id ? "active" : ""}" type="button" data-id="${chapter.id}">
      <span>${index + 1}. ${escapeHtml(chapter.title)}</span>
      <small>${chapter.content.replace(/\s/g, "").length}</small>
    </button>
  `).join("");
  chapterList.querySelectorAll(".chapter-item").forEach((button) => {
    button.addEventListener("click", () => selectChapter(button.dataset.id));
  });
}

function selectChapter(chapterId) {
  activeChapter = chapters.find((chapter) => chapter.id === chapterId) || null;
  if (!activeChapter) return;
  setEditorAvailability(true);
  chapterTitle.value = activeChapter.title;
  chapterContent.value = activeChapter.content;
  chapterStatus.value = activeChapter.status;
  saveStatus.textContent = "已保存";
  editorMessage.textContent = "";
  updateWordCount();
  renderChapters();
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function loadWork() {
  const worksResponse = await fetch(`${API_BASE_URL}/api/users/${user.id}/works`, { headers: headers() });
  if (!worksResponse.ok) throw new Error("无法读取作品。");
  const works = await worksResponse.json();
  const work = works.find((item) => item.id === workId);
  if (!work) throw new Error("作品不存在或无权访问。");
  workTitle.textContent = work.title;
  const chaptersResponse = await fetch(`${API_BASE_URL}/api/works/${workId}/chapters`, { headers: headers() });
  if (!chaptersResponse.ok) throw new Error("无法读取章节。");
  chapters = await chaptersResponse.json();
  renderChapters();
  if (chapters[0]) selectChapter(chapters[0].id);
  else {
    chapterTitle.value = "";
    chapterContent.value = "";
    chapterStatus.value = "draft";
    saveStatus.textContent = "请创建第一章";
    setEditorAvailability(false);
    updateWordCount();
  }
}

document.querySelector("#add-chapter").addEventListener("click", async () => {
  const title = window.prompt("请输入章节标题", `第${chapters.length + 1}章`);
  if (!title?.trim()) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/works/${workId}/chapters`, {
      method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: "", position: chapters.length + 1, status: "draft" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "创建章节失败。");
    chapters.push(data);
    selectChapter(data.id);
  } catch (error) { showMessage(sidebarMessage, error.message); }
});

async function saveChapter(isAutoSave = false) {
  if (!activeChapter) return;
  if (saveInFlight) return;
  saveInFlight = true;
  saveButton.disabled = true;
  saveButton.querySelector("span").textContent = isAutoSave ? "自动保存中..." : "保存中...";
  saveStatus.textContent = isAutoSave ? "自动保存中..." : "保存中...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/chapters/${activeChapter.id}`, {
      method: "PATCH", headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ title: chapterTitle.value.trim(), content: chapterContent.value, status: chapterStatus.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存失败。");
    activeChapter = data;
    chapters = chapters.map((chapter) => chapter.id === data.id ? data : chapter);
    saveStatus.textContent = isAutoSave ? "已自动保存" : "已保存";
    editorMessage.textContent = isAutoSave ? "" : "保存成功";
    renderChapters();
  } catch (error) { editorMessage.textContent = error.message; }
  finally {
    saveInFlight = false;
    saveButton.disabled = false;
    saveButton.querySelector("span").textContent = "保存章节";
  }
}

function scheduleAutoSave() {
  if (!activeChapter) return;
  window.clearTimeout(autoSaveTimer);
  saveStatus.textContent = "等待自动保存";
  autoSaveTimer = window.setTimeout(() => saveChapter(true), 1200);
}

saveButton.addEventListener("click", () => saveChapter(false));

deleteButton.addEventListener("click", async () => {
  if (!activeChapter || !window.confirm(`确定删除《${activeChapter.title}》吗？章节正文将一并删除。`)) return;
  const response = await fetch(`${API_BASE_URL}/api/chapters/${activeChapter.id}`, { method: "DELETE", headers: headers() });
  if (!response.ok) { showMessage(editorMessage, "删除章节失败。"); return; }
  chapters = chapters.filter((chapter) => chapter.id !== activeChapter.id);
  activeChapter = chapters[0] || null;
  renderChapters();
  if (activeChapter) selectChapter(activeChapter.id);
  else { chapterTitle.value = ""; chapterContent.value = ""; updateWordCount(); saveStatus.textContent = "暂无章节"; }
});

chapterContent.addEventListener("input", () => { updateWordCount(); scheduleAutoSave(); });
chapterTitle.addEventListener("input", scheduleAutoSave);
chapterStatus.addEventListener("change", scheduleAutoSave);
document.querySelector("#logout-button").addEventListener("click", () => { localStorage.clear(); window.location.href = "./index.html"; });

loadWork().catch((error) => showMessage(editorMessage, error.message));
