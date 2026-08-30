# 阅读辅助平台后端

这个服务将前端的写作请求安全转发给 Dify。Dify API 密钥和 JWT 签名密钥仅保存在 `.env` 中，不能放进浏览器前端。

## 启动

在 PowerShell 中、项目目录内执行：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
uvicorn app.main:app --reload
```

在 `.env` 中把 `DIFY_API_KEY` 的值替换成你新生成的 Dify API 密钥并保存。不要把该文件上传到 GitHub。

`JWT_SECRET_KEY` 必须是至少 32 个字符的随机字符串。修改 `.env` 后需要重启 Uvicorn。

启动成功后访问：

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## 测试写作接口

先在 Swagger 页面中完成登录：

1. 展开 `POST /api/auth/register`，注册新账号；或使用 `POST /api/auth/login` 登录。
2. 复制返回的 `access_token`。
3. 点击页面右上角 **Authorize**，输入 `Bearer <access_token>`。
4. 再调用需要登录的接口。

登录接口：

- `POST /api/auth/register`：注册并自动登录
- `POST /api/auth/login`：登录
- `GET /api/auth/me`：读取当前登录用户

作品和章节接口已经按令牌中的用户 ID 隔离。不要再相信前端传入的 `user_id`，AI 接口也会自动使用当前登录用户。

## 随笔接口

随笔是全局灵感碎片箱，可关联零个或多个自己的作品：

- `POST /api/notes`：创建随笔
- `GET /api/notes`：查看随笔，支持 `tag`、`search`、`work_id` 筛选
- `GET /api/notes/{note_id}`：查看详情
- `PATCH /api/notes/{note_id}`：修改随笔和关联作品
- `DELETE /api/notes/{note_id}`：删除随笔

创建示例：

```json
{
  "title": "雁门驿的铜牌",
  "content": "沈砚发现铜牌背面刻着一个已经磨损的军号。",
  "tags": ["灵感片段", "悬疑"],
  "work_ids": []
}
```

授权后，在 Swagger 页面展开 `POST /api/ai/chat`，点击 **Try it out**，填入：

```json
{
  "mode": "续写",
  "message": "请续写沈砚发现铜牌后的场景，约100字。",
  "conversation_id": ""
}
```

接口成功后会返回 AI 回答和 Dify 的 `conversation_id`；前端应在后续请求中回传它以延续对话。

## 作品编辑器

在工作台点击作品卡片中的“打开作品”，可以：

- 查看作品章节
- 新建章节
- 编辑章节标题和纯文本正文
- 修改章节状态
- 保存章节
- 删除章节
