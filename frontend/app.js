const form = document.querySelector("#register-form");
const nicknameInput = document.querySelector("#nickname");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const termsInput = document.querySelector("#terms");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector(".submit-button");
const togglePassword = document.querySelector("#toggle-password");
const loginLink = document.querySelector("#login-link");

const API_BASE_URL = "http://127.0.0.1:8000";

function setMessage(text, isSuccess = false) {
  message.textContent = text;
  message.classList.toggle("success", isSuccess);
}

function markInvalid(input, invalid) {
  input.classList.toggle("invalid", invalid);
}

togglePassword.addEventListener("click", () => {
  const nextType = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = nextType;
  confirmPasswordInput.type = nextType;
  togglePassword.setAttribute("aria-label", nextType === "text" ? "隐藏密码" : "显示密码");
});

loginLink.addEventListener("click", () => {
  setMessage("登录页面将在下一步接入。");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const nickname = nicknameInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const nicknamePattern = /^[\w\u4e00-\u9fff]+$/;

  const nicknameInvalid = nickname.length < 2 || nickname.length > 20 || !nicknamePattern.test(nickname);
  const passwordInvalid = password.length < 6 || password.length > 72;
  const confirmInvalid = password !== confirmPassword;

  markInvalid(nicknameInput, nicknameInvalid);
  markInvalid(passwordInput, passwordInvalid);
  markInvalid(confirmPasswordInput, confirmInvalid);

  if (nicknameInvalid) {
    setMessage("请填写 2-20 个中文、英文、数字或下划线组成的昵称。");
    nicknameInput.focus();
    return;
  }
  if (passwordInvalid) {
    setMessage("密码长度需要在 6-72 位之间。");
    passwordInput.focus();
    return;
  }
  if (confirmInvalid) {
    setMessage("两次输入的密码不一致。");
    confirmPasswordInput.focus();
    return;
  }
  if (!termsInput.checked) {
    setMessage("请先同意服务条款与隐私政策。");
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "正在创建...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "注册失败，请稍后重试。");
    }

    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("current_user", JSON.stringify(data.user));
    setMessage("账号创建成功，登录状态已保存。", true);
    form.reset();
  } catch (error) {
    setMessage(error.message || "暂时无法连接服务器。");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "创建账号";
  }
});
