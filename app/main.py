import base64
import hashlib
import hmac
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import asyncpg
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.db import create_database_pool

PROJECT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_DIR / ".env")

JWT_ALGORITHM = "HS256"
bearer_scheme = HTTPBearer(auto_error=False)


class ChatRequest(BaseModel):
    mode: str = Field(description="Dify 中配置的创作模式，例如：续写")
    message: str = Field(min_length=1, max_length=10_000)
    conversation_id: str = ""


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str


class CreateUserRequest(BaseModel):
    nickname: str = Field(min_length=2, max_length=20, pattern=r"^[\w\u4e00-\u9fff]+$")
    password: str = Field(min_length=6, max_length=72)


class LoginRequest(CreateUserRequest):
    pass


class UserResponse(BaseModel):
    id: UUID
    nickname: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class CreateWorkRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    summary: str = Field(default="", max_length=5_000)
    writing_style: str = Field(default="", max_length=500)


class WorkResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    category: str | None
    summary: str
    writing_style: str


class CreateChapterRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=200_000)
    position: int = Field(ge=1)
    status: str = Field(default="draft", pattern=r"^(draft|writing|completed)$")


class ChapterResponse(BaseModel):
    id: UUID
    work_id: UUID
    title: str
    content: str
    position: int
    status: str


class CreateNoteRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=200_000)
    tags: list[str] = Field(default_factory=list, max_length=20)
    work_ids: list[UUID] = Field(default_factory=list, max_length=20)


class UpdateNoteRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1, max_length=200_000)
    tags: list[str] | None = Field(default=None, max_length=20)
    work_ids: list[UUID] | None = Field(default=None, max_length=20)


class NoteResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    content: str
    tags: list[str]
    work_ids: list[UUID]


def hash_password(password: str) -> str:
    """生成带随机盐的 scrypt 密码散列；绝不保存明文密码。"""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        scheme, salt_text, digest_text = encoded_hash.split("$", 2)
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_text)
        expected_digest = base64.b64decode(digest_text)
        actual_digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual_digest, expected_digest)
    except (TypeError, ValueError):
        return False


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret or len(secret) < 32:
        raise HTTPException(status_code=500, detail="服务器尚未配置有效的 JWT_SECRET_KEY")
    return secret


def create_access_token(user_id: UUID) -> str:
    try:
        expires_minutes = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="JWT_EXPIRE_MINUTES 配置无效") from exc
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def auth_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未登录或登录已过期",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserResponse:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise auth_error()
    try:
        payload = jwt.decode(credentials.credentials, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user_id = UUID(str(payload["sub"]))
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        raise auth_error()

    async with app.state.db_pool.acquire() as connection:
        row = await connection.fetchrow(
            "SELECT id, nickname FROM users WHERE id = $1",
            user_id,
        )
    if row is None:
        raise auth_error()
    return UserResponse(**dict(row))


def get_dify_config() -> tuple[str, str]:
    api_key = os.getenv("DIFY_API_KEY")
    base_url = os.getenv("DIFY_API_BASE_URL", "https://api.dify.ai/v1").rstrip("/")
    if not api_key:
        raise HTTPException(status_code=500, detail="服务器尚未配置 DIFY_API_KEY")
    return api_key, base_url


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_pool = await create_database_pool()
    yield
    await app.state.db_pool.close()


app = FastAPI(title="阅读辅助平台 API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8003",
        "http://localhost:8003",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def insert_user(request: CreateUserRequest) -> UserResponse:
    password_hash = hash_password(request.password)
    try:
        async with app.state.db_pool.acquire() as connection:
            row = await connection.fetchrow(
                """
                INSERT INTO users (nickname, password_hash)
                VALUES ($1, $2)
                RETURNING id, nickname
                """,
                request.nickname,
                password_hash,
            )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="昵称已存在") from exc
    return UserResponse(**dict(row))


@app.get("/health")
async def health_check() -> dict[str, str]:
    async with app.state.db_pool.acquire() as connection:
        await connection.fetchval("SELECT 1")
    return {"status": "ok", "database": "connected"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
async def register(request: CreateUserRequest) -> AuthResponse:
    user = await insert_user(request)
    return AuthResponse(access_token=create_access_token(user.id), user=user)


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest) -> AuthResponse:
    async with app.state.db_pool.acquire() as connection:
        row = await connection.fetchrow(
            "SELECT id, nickname, password_hash FROM users WHERE nickname = $1",
            request.nickname,
        )
    if row is None or not verify_password(request.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="昵称或密码错误")
    user = UserResponse(id=row["id"], nickname=row["nickname"])
    return AuthResponse(access_token=create_access_token(user.id), user=user)


@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return current_user


@app.post("/api/users", response_model=UserResponse, status_code=201, deprecated=True)
async def create_user(request: CreateUserRequest) -> UserResponse:
    """兼容旧测试流程；新客户端应使用 /api/auth/register。"""
    return await insert_user(request)


@app.post("/api/users/{user_id}/works", response_model=WorkResponse, status_code=201)
async def create_work(
    user_id: UUID,
    request: CreateWorkRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> WorkResponse:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="不能操作其他用户的作品")
    async with app.state.db_pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO works (user_id, title, category, summary, writing_style)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, title, category, summary, writing_style
            """,
            current_user.id,
            request.title,
            request.category,
            request.summary,
            request.writing_style,
        )
    return WorkResponse(**dict(row))


@app.get("/api/users/{user_id}/works", response_model=list[WorkResponse])
async def list_works(
    user_id: UUID,
    current_user: UserResponse = Depends(get_current_user),
) -> list[WorkResponse]:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="不能查看其他用户的作品")
    async with app.state.db_pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT id, user_id, title, category, summary, writing_style
            FROM works
            WHERE user_id = $1
            ORDER BY updated_at DESC
            """,
            current_user.id,
        )
    return [WorkResponse(**dict(row)) for row in rows]


async def ensure_owned_work(connection: asyncpg.Connection, work_id: UUID, user_id: UUID) -> None:
    work_exists = await connection.fetchval(
        "SELECT 1 FROM works WHERE id = $1 AND user_id = $2",
        work_id,
        user_id,
    )
    if not work_exists:
        raise HTTPException(status_code=404, detail="作品不存在")


async def ensure_owned_works(
    connection: asyncpg.Connection,
    work_ids: list[UUID],
    user_id: UUID,
) -> None:
    unique_work_ids = list(dict.fromkeys(work_ids))
    if not unique_work_ids:
        return
    count = await connection.fetchval(
        "SELECT COUNT(*) FROM works WHERE user_id = $1 AND id = ANY($2::uuid[])",
        user_id,
        unique_work_ids,
    )
    if count != len(unique_work_ids):
        raise HTTPException(status_code=404, detail="关联作品不存在或不属于当前用户")


async def fetch_note(connection: asyncpg.Connection, note_id: UUID, user_id: UUID) -> NoteResponse:
    row = await connection.fetchrow(
        """
        SELECT n.id, n.user_id, n.title, n.content, n.tags,
               COALESCE(array_agg(nwl.work_id) FILTER (WHERE nwl.work_id IS NOT NULL), '{}') AS work_ids
        FROM notes n
        LEFT JOIN note_work_links nwl ON nwl.note_id = n.id
        WHERE n.id = $1 AND n.user_id = $2
        GROUP BY n.id
        """,
        note_id,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="随笔不存在")
    return NoteResponse(**dict(row))


@app.post("/api/notes", response_model=NoteResponse, status_code=201)
async def create_note(
    request: CreateNoteRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> NoteResponse:
    work_ids = list(dict.fromkeys(request.work_ids))
    async with app.state.db_pool.acquire() as connection:
        async with connection.transaction():
            await ensure_owned_works(connection, work_ids, current_user.id)
            row = await connection.fetchrow(
                """
                INSERT INTO notes (user_id, title, content, tags)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                """,
                current_user.id,
                request.title,
                request.content,
                request.tags,
            )
            if work_ids:
                await connection.executemany(
                    "INSERT INTO note_work_links (note_id, work_id) VALUES ($1, $2)",
                    [(row["id"], work_id) for work_id in work_ids],
                )
        return await fetch_note(connection, row["id"], current_user.id)


@app.get("/api/notes", response_model=list[NoteResponse])
async def list_notes(
    tag: str | None = None,
    search: str | None = None,
    work_id: UUID | None = None,
    current_user: UserResponse = Depends(get_current_user),
) -> list[NoteResponse]:
    conditions = ["n.user_id = $1"]
    args: list[object] = [current_user.id]
    if tag:
        args.append(tag)
        conditions.append(f"${len(args)} = ANY(n.tags)")
    if search:
        args.append(f"%{search}%")
        conditions.append(f"(n.title ILIKE ${len(args)} OR n.content ILIKE ${len(args)})")
    if work_id:
        args.append(work_id)
        conditions.append(
            f"EXISTS (SELECT 1 FROM note_work_links filter_link "
            f"WHERE filter_link.note_id = n.id AND filter_link.work_id = ${len(args)})"
        )
    rows = await app.state.db_pool.fetch(
        f"""
        SELECT n.id, n.user_id, n.title, n.content, n.tags,
               COALESCE(array_agg(nwl.work_id) FILTER (WHERE nwl.work_id IS NOT NULL), '{{}}') AS work_ids
        FROM notes n
        LEFT JOIN note_work_links nwl ON nwl.note_id = n.id
        WHERE {" AND ".join(conditions)}
        GROUP BY n.id
        ORDER BY n.updated_at DESC
        """,
        *args,
    )
    return [NoteResponse(**dict(row)) for row in rows]


@app.get("/api/notes/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: UUID,
    current_user: UserResponse = Depends(get_current_user),
) -> NoteResponse:
    async with app.state.db_pool.acquire() as connection:
        return await fetch_note(connection, note_id, current_user.id)


@app.patch("/api/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    request: UpdateNoteRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> NoteResponse:
    if request.title is None and request.content is None and request.tags is None and request.work_ids is None:
        raise HTTPException(status_code=400, detail="至少提供一个需要修改的字段")
    work_ids = list(dict.fromkeys(request.work_ids or []))
    async with app.state.db_pool.acquire() as connection:
        async with connection.transaction():
            note_exists = await connection.fetchval(
                "SELECT 1 FROM notes WHERE id = $1 AND user_id = $2",
                note_id,
                current_user.id,
            )
            if not note_exists:
                raise HTTPException(status_code=404, detail="随笔不存在")
            await ensure_owned_works(connection, work_ids, current_user.id)
            await connection.execute(
                """
                UPDATE notes
                SET title = COALESCE($1, title),
                    content = COALESCE($2, content),
                    tags = COALESCE($3, tags),
                    updated_at = NOW()
                WHERE id = $4 AND user_id = $5
                """,
                request.title,
                request.content,
                request.tags,
                note_id,
                current_user.id,
            )
            if request.work_ids is not None:
                await connection.execute("DELETE FROM note_work_links WHERE note_id = $1", note_id)
                if work_ids:
                    await connection.executemany(
                        "INSERT INTO note_work_links (note_id, work_id) VALUES ($1, $2)",
                        [(note_id, work_id) for work_id in work_ids],
                    )
        return await fetch_note(connection, note_id, current_user.id)


@app.delete("/api/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: UUID,
    current_user: UserResponse = Depends(get_current_user),
) -> None:
    async with app.state.db_pool.acquire() as connection:
        deleted = await connection.execute(
            "DELETE FROM notes WHERE id = $1 AND user_id = $2",
            note_id,
            current_user.id,
        )
    if deleted == "DELETE 0":
        raise HTTPException(status_code=404, detail="随笔不存在")


@app.post("/api/works/{work_id}/chapters", response_model=ChapterResponse, status_code=201)
async def create_chapter(
    work_id: UUID,
    request: CreateChapterRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> ChapterResponse:
    async with app.state.db_pool.acquire() as connection:
        await ensure_owned_work(connection, work_id, current_user.id)
        try:
            row = await connection.fetchrow(
                """
                INSERT INTO chapters (work_id, title, content, position, status)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, work_id, title, content, position, status
                """,
                work_id,
                request.title,
                request.content,
                request.position,
                request.status,
            )
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(status_code=409, detail="该作品内的章节序号已存在") from exc
    return ChapterResponse(**dict(row))


@app.get("/api/works/{work_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(
    work_id: UUID,
    current_user: UserResponse = Depends(get_current_user),
) -> list[ChapterResponse]:
    async with app.state.db_pool.acquire() as connection:
        await ensure_owned_work(connection, work_id, current_user.id)
        rows = await connection.fetch(
            """
            SELECT id, work_id, title, content, position, status
            FROM chapters
            WHERE work_id = $1
            ORDER BY position ASC
            """,
            work_id,
        )
    return [ChapterResponse(**dict(row)) for row in rows]


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat_with_writing_agent(
    request: ChatRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> ChatResponse:
    """将前端请求转发至 Dify；用户标识来自登录令牌。"""
    api_key, base_url = get_dify_config()
    payload = {
        "inputs": {"mode": request.mode},
        "query": request.message,
        "response_mode": "blocking",
        "conversation_id": request.conversation_id,
        "user": str(current_user.id),
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{base_url}/chat-messages",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="暂时无法连接 AI 服务") from exc

    if response.is_error:
        raise HTTPException(status_code=response.status_code, detail="AI 服务请求失败")

    data = response.json()
    return ChatResponse(
        answer=data.get("answer", ""),
        conversation_id=data.get("conversation_id", ""),
    )
