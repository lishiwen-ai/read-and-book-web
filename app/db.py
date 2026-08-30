import os

import asyncpg


async def create_database_pool() -> asyncpg.Pool:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("服务器尚未配置 DATABASE_URL")

    return await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=5)
