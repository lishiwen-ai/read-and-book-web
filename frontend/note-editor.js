const API_BASE_URL = "http://127.0.0.1:8000";
const token = localStorage.getItem("access_token");
const user = JSON.parse(localStorage.getItem("current_user") || "null");
const noteId = new URLSearchParams(window.location.search).get("note_id");

const noteHeadingTitle = document.querySelector("#note-heading-title");
const noteTitle = document.querySelector("#note-title");
const noteTags = document.querySelector("#note-tags");
const noteContent = document.querySelector("#note-content");
const wordCount = document.querySelector("#word-count");
const saveStatus = document.querySelector("#save-status");
const editorMessage = document.querySelector("#note-editor-message");
const saveButton = document.querySelector("#save-note");
const aiToggle = document.querySelector("#ai-toggle");
const aiPanel = document.querySelector("#ai-panel");
const aiClose = document.querySelector("#ai-close");
const aiMode = document.querySelector("#ai-mode");
const aiMessages = document.querySelector("#ai-messages");
const aiForm = document.querySelector("#ai-form");
const aiInput = document.querySelector("#ai-input");
const aiSend = document.querySelector("#ai-send");
let note = null;
let autoSaveTimer = null;
let saveInFlight = false;
let aiConversationId = localStorage.getItem(`ai_conversation_note_${noteId}`) || "";

if (!token || !user || !noteId) {
  window.location.href = "./dashboard.html";
}

function headers() {
  return { Authorization: `Bearer ${token}` };
}

function parseTags(value) {
  return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function updateWordCount() {
  wordCount.textContent = `${noteContent.value.replace(/\s/g, "").length} 字`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toggleAiPanel(open) {
  aiPanel.classList.toggle("hidden", !open);
  document.body.classList.toggle("note-ai-closed", !open);
  aiToggle.setAttribute("aria-expanded", String(open));
  aiToggle.setAttribute("title", open ? "关闭 AI 创作助手" : "打开 AI 创作助手");
  if (open) aiInput.focus();
}

function appendAiMessage(role, text, insertable = false) {
  const message = document.createElement("div");
  message.className = `ai-message ${role}`;
  const copy = document.createElement("p");
  copy.textContent = text;
  message.append(copy);
  if (insertable) {
    const insertButton = document.createElement("button");
    insertButton.className = "ai-insert";
    insertButton.type = "button";
    insertButton.textContent = "插入正文";
    insertButton.addEventListener("click", () => {
      const currentContent = noteContent.value.trimEnd();
      noteContent.value = currentContent ? `${currentContent}\n\n${text}` : text;
      updateWordCount();
      scheduleAutoSave();
      insertButton.textContent = "已插入";
      insertButton.disabled = true;
    });
    message.append(insertButton);
  }
  aiMessages.append(message);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function buildAiPrompt(request) {
  return [
    `你是中文随笔创作助手。当前任务是：${aiMode.value}。`,
    "请只参考当前随笔，不要虚构人物设定或世界观背景；保持作者原有的语气和核心想法。",
    `随笔标题：${noteTitle.value.trim() || "未命名随笔"}`,
    `随笔内容：\n${noteContent.value.slice(-8500)}`,
    `作者要求：${request}`,
  ].join("\n\n").slice(0, 9800);
}

async function sendAiRequest(request) {
  appendAiMessage("user", request);
  aiInput.value = "";
  aiSend.disabled = true;
  aiSend.querySelector("span").textContent = "思考中...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: aiMode.value,
        message: buildAiPrompt(request),
        conversation_id: aiConversationId,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "AI 暂时无法回应。");
    aiConversationId = data.conversation_id || aiConversationId;
    if (aiConversationId) localStorage.setItem(`ai_conversation_note_${noteId}`, aiConversationId);
    appendAiMessage("assistant", data.answer || "AI 没有返回内容。", true);
  } catch (error) {
    appendAiMessage("assistant error", error.message);
  } finally {
    aiSend.disabled = false;
    aiSend.querySelector("span").textContent = "发送";
    aiInput.focus();
  }
}

async function loadNote() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, { headers: headers() });
    const data = await response.json();
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("current_user");
      window.location.href = "./index.html";
      return;
    }
    if (!response.ok) throw new Error(data.detail || "无法读取随笔。");
    note = data;
    noteHeadingTitle.textContent = data.title;
    noteTitle.value = data.title;
    noteTags.value = data.tags.join("，");
    noteContent.value = data.content;
    saveStatus.textContent = "已保存";
    updateWordCount();
    noteTitle.focus();
  } catch (error) {
    editorMessage.textContent = error.message;
    saveStatus.textContent = "读取失败";
  }
}

async function saveNote(isAutoSave = false) {
  if (!note || saveInFlight) return;
  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();
  if (!title || !content) {
    editorMessage.textContent = "标题和正文不能为空。";
    saveStatus.textContent = "未保存";
    return;
  }
  saveInFlight = true;
  saveButton.disabled = true;
  saveButton.querySelector("span").textContent = isAutoSave ? "自动保存中..." : "保存中...";
  saveStatus.textContent = isAutoSave ? "自动保存中..." : "保存中...";
  try {
    const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        tags: parseTags(noteTags.value),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存随笔失败。");
    note = data;
    noteHeadingTitle.textContent = data.title;
    noteTitle.value = data.title;
    noteTags.value = data.tags.join("，");
    saveStatus.textContent = isAutoSave ? "已自动保存" : "已保存";
    editorMessage.textContent = isAutoSave ? "" : "保存成功";
  } catch (error) {
    editorMessage.textContent = error.message;
    saveStatus.textContent = "保存失败";
  } finally {
    saveInFlight = false;
    saveButton.disabled = false;
    saveButton.querySelector("span").textContent = "保存随笔";
  }
}

function scheduleAutoSave() {
  if (!note) return;
  window.clearTimeout(autoSaveTimer);
  saveStatus.textContent = "等待自动保存";
  autoSaveTimer = window.setTimeout(() => saveNote(true), 1200);
}

aiToggle.addEventListener("click", () => toggleAiPanel(aiPanel.classList.contains("hidden")));
aiClose.addEventListener("click", () => toggleAiPanel(false));

aiForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const request = aiInput.value.trim();
  if (request) sendAiRequest(request);
});

aiInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    aiForm.requestSubmit();
  }
});

noteTitle.addEventListener("input", () => {
  noteHeadingTitle.textContent = noteTitle.value.trim() || "未命名随笔";
  scheduleAutoSave();
});
noteTags.addEventListener("input", scheduleAutoSave);
noteContent.addEventListener("input", () => {
  updateWordCount();
  scheduleAutoSave();
});
saveButton.addEventListener("click", () => saveNote(false));
document.querySelector("#logout-button").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "./index.html";
});

loadNote();
