-- 初始化仅创建 PostgreSQL 扩展；业务数据表将在下一步通过迁移脚本创建。
CREATE EXTENSION IF NOT EXISTS pgcrypto;

