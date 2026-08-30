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
const chaptersTab = document.querySelector("#chapters-tab");
const charactersTab = document.querySelector("#characters-tab");
const chaptersHeading = document.querySelector("#chapters-heading");
const charactersHeading = document.querySelector("#characters-heading");
const characterList = document.querySelector("#character-list");
const writingPane = document.querySelector(".writing-pane");
const characterPane = document.querySelector("#character-pane");
const characterForm = document.querySelector("#character-form");
const characterFormTitle = document.querySelector("#character-form-title");
const characterMessage = document.querySelector("#character-message");
const cancelCharacter = document.querySelector("#cancel-character");
const characterName = document.querySelector("#character-name");
const characterOccupation = document.querySelector("#character-occupation");
const characterGender = document.querySelector("#character-gender");
const characterAge = document.querySelector("#character-age");
const characterPersonality = document.querySelector("#character-personality");
const characterAppearance = document.querySelector("#character-appearance");
const characterRelationships = document.querySelector("#character-relationships");
const characterBackstory = document.querySelector("#character-backstory");
const characterNotes = document.querySelector("#character-notes");
const confirmDialog = document.querySelector("#confirm-dialog");
const confirmTitle = document.querySelector("#confirm-title");
const confirmCopy = document.querySelector("#confirm-copy");
const cancelConfirm = document.querySelector("#cancel-confirm");
const acceptConfirm = document.querySelector("#accept-confirm");
const chapterDialog = document.querySelector("#chapter-dialog");
const chapterForm = document.querySelector("#chapter-form");
const newChapterTitle = document.querySelector("#new-chapter-title");
const chapterDialogMessage = document.querySelector("#chapter-dialog-message");
const cancelChapterDialog = document.querySelector("#cancel-chapter-dialog");
const cancelChapterButton = document.querySelector("#cancel-chapter-button");
let chapters = [];
let activeChapter = null;
let characters = [];
let activeCharacter = null;
let autoSaveTimer = null;
let saveInFlight = false;
let pendingConfirmation = null;

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

function setEditorMode(mode) {
  const charactersMode = mode === "characters";
  chaptersTab.classList.toggle("active", !charactersMode);
  charactersTab.classList.toggle("active", charactersMode);
  chaptersHeading.classList.toggle("hidden", charactersMode);
  charactersHeading.classList.toggle("hidden", !charactersMode);
  chapterList.classList.toggle("hidden", charactersMode);
  characterList.classList.toggle("hidden", !charactersMode);
  addChapter.classList.toggle("hidden", charactersMode);
  writingPane.classList.toggle("hidden", charactersMode);
  characterPane.classList.toggle("hidden", !charactersMode);
}

function clearCharacterForm() {
  activeCharacter = null;
  characterForm.reset();
  characterFormTitle.textContent = "新增人物";
  characterMessage.textContent = "";
}

function fillCharacterForm(character) {
  activeCharacter = character;
  characterFormTitle.textContent = "编辑人物";
  characterName.value = character.name;
  characterOccupation.value = character.occupation;
  characterGender.value = character.gender;
  characterAge.value = character.age;
  characterPersonality.value = character.personality;
  characterAppearance.value = character.appearance;
  characterRelationships.value = character.relationships;
  characterBackstory.value = character.backstory;
  characterNotes.value = character.notes;
  characterMessage.textContent = "";
}

function renderCharacters() {
  characterList.innerHTML = characters.map((character) => `
    <div class="character-card ${activeCharacter?.id === character.id ? "active" : ""}">
      <button type="button" data-character-id="${character.id}">
        <strong>${escapeHtml(character.name)}</strong>
        <small>${escapeHtml(character.occupation || "未填写身份")}</small>
      </button>
      <button class="character-delete" type="button" data-delete-character-id="${character.id}" aria-label="删除 ${escapeHtml(character.name)}" title="删除人物">×</button>
    </div>
  `).join("");
  characterList.querySelectorAll("[data-character-id]").forEach((button) => {
    button.addEventListener("click", () => {
      fillCharacterForm(characters.find((character) => character.id === button.dataset.characterId));
      renderCharacters();
    });
  });
  characterList.querySelectorAll("[data-delete-character-id]").forEach((button) => {
    button.addEventListener("click", () => deleteCharacter(button.dataset.deleteCharacterId));
  });
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
  const charactersResponse = await fetch(`${API_BASE_URL}/api/works/${workId}/characters`, { headers: headers() });
  if (!charactersResponse.ok) throw new Error("无法读取人物设定。");
  characters = await charactersResponse.json();
  renderCharacters();
  setEditorMode("chapters");
}

const addChapter = document.querySelector("#add-chapter");

document.querySelector("#add-chapter").addEventListener("click", () => {
  newChapterTitle.value = `第${chapters.length + 1}章`;
  chapterDialogMessage.textContent = "";
  chapterDialog.showModal();
  newChapterTitle.focus();
});

function closeChapterDialog() {
  chapterDialog.close();
}

cancelChapterDialog.addEventListener("click", closeChapterDialog);
cancelChapterButton.addEventListener("click", closeChapterDialog);
chapterDialog.addEventListener("cancel", closeChapterDialog);

chapterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = newChapterTitle.value.trim();
  if (!title) return;
  chapterDialogMessage.textContent = "";
  try {
    const response = await fetch(`${API_BASE_URL}/api/works/${workId}/chapters`, {
      method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: "", position: chapters.length + 1, status: "draft" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "创建章节失败。");
    closeChapterDialog();
    chapters.push(data);
    selectChapter(data.id);
  } catch (error) { chapterDialogMessage.textContent = error.message; }
});

chaptersTab.addEventListener("click", () => setEditorMode("chapters"));
charactersTab.addEventListener("click", () => {
  clearCharacterForm();
  setEditorMode("characters");
});
cancelCharacter.addEventListener("click", clearCharacterForm);

characterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: characterName.value.trim(),
    occupation: characterOccupation.value.trim(),
    gender: characterGender.value.trim(),
    age: characterAge.value.trim(),
    personality: characterPersonality.value.trim(),
    appearance: characterAppearance.value.trim(),
    relationships: characterRelationships.value.trim(),
    backstory: characterBackstory.value.trim(),
    notes: characterNotes.value.trim(),
    position: activeCharacter?.position || characters.length + 1,
  };
  if (!payload.name) return;
  const method = activeCharacter ? "PATCH" : "POST";
  const url = activeCharacter
    ? `${API_BASE_URL}/api/characters/${activeCharacter.id}`
    : `${API_BASE_URL}/api/works/${workId}/characters`;
  try {
    const response = await fetch(url, {
      method,
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存人物失败。");
    if (activeCharacter) {
      characters = characters.map((character) => character.id === data.id ? data : character);
    } else {
      characters.push(data);
    }
    fillCharacterForm(data);
    renderCharacters();
    characterMessage.textContent = "保存成功";
  } catch (error) {
    characterMessage.textContent = error.message;
  }
});

async function deleteCharacter(characterId) {
  const character = characters.find((item) => item.id === characterId);
  if (!character || !(await requestConfirmation("删除这个人物？", `人物“${character.name}”的设定将被删除，此操作无法撤销。`))) return;
  const response = await fetch(`${API_BASE_URL}/api/characters/${characterId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) {
    characterMessage.textContent = "删除人物失败。";
    return;
  }
  characters = characters.filter((item) => item.id !== characterId);
  clearCharacterForm();
  renderCharacters();
}

function requestConfirmation(title, copy) {
  confirmTitle.textContent = title;
  confirmCopy.textContent = copy;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    pendingConfirmation = resolve;
  });
}

function finishConfirmation(confirmed) {
  confirmDialog.close();
  pendingConfirmation?.(confirmed);
  pendingConfirmation = null;
}

cancelConfirm.addEventListener("click", () => finishConfirmation(false));
acceptConfirm.addEventListener("click", () => finishConfirmation(true));
confirmDialog.addEventListener("cancel", () => finishConfirmation(false));


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
  if (!activeChapter || !(await requestConfirmation("删除这一章？", `《${activeChapter.title}》的正文将一并删除，此操作无法撤销。`))) return;
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
