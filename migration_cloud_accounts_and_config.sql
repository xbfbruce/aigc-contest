-- ============================================
-- 一次性迁移：评委账号 + 站点配置 全部上云
-- ============================================
-- 执行方式：Supabase 控制台 → SQL Editor → 全部粘贴 → Run
-- 幂等，可重复执行；不会影响已有的作品、评分数据。
--
-- 本脚本解决两件事：
--   【一】评委账号无法跨设备使用
--         judges 表的行级安全策略只授权给 authenticated 角色，
--         而本站前端只使用 anon 密钥，因此：
--           • anon SELECT judges → 永远返回空数组（策略静默过滤）
--           • anon INSERT judges → 42501 权限错误
--         结果：管理端只能把评委写进本机 localStorage，
--               换一台设备既看不到账号，也无法登录。
--
--   【二】投稿规格 / 管理员账号 / 评分项 也是每台设备各存一份
--         这些数据原本只写在 localStorage，设备 1 改的配置设备 2 看不到。
--         新建 site_config 表统一存放，前端读写云端、本机仅作缓存。
-- ============================================


-- ============================================
-- 【一】judges 表：为 anon 开放读写策略
-- ============================================

ALTER TABLE judges ENABLE ROW LEVEL SECURITY;

-- 清理旧的、仅限 authenticated 的策略（名称可能因历史版本不同）
DROP POLICY IF EXISTS "Authenticated users can view judges" ON judges;
DROP POLICY IF EXISTS "Authenticated users can insert judges" ON judges;
DROP POLICY IF EXISTS "Authenticated users can delete judges" ON judges;
DROP POLICY IF EXISTS "Authenticated users can update judges" ON judges;
DROP POLICY IF EXISTS "Allow anon select judges" ON judges;
DROP POLICY IF EXISTS "Allow anon insert judges" ON judges;
DROP POLICY IF EXISTS "Allow anon update judges" ON judges;
DROP POLICY IF EXISTS "Allow anon delete judges" ON judges;

-- 读取评委列表（管理端展示、评委端登录校验）
CREATE POLICY "Allow anon select judges"
ON judges FOR SELECT
TO anon, authenticated
USING (true);

-- 新增评委账号
CREATE POLICY "Allow anon insert judges"
ON judges FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 修改评委（重置密码、改名）
CREATE POLICY "Allow anon update judges"
ON judges FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 删除评委账号
CREATE POLICY "Allow anon delete judges"
ON judges FOR DELETE
TO anon, authenticated
USING (true);

-- ============================================
-- 【二】site_config 表：站点级共享配置
-- ============================================
-- key 取值：
--   submissionSpecs  投稿规格（视频/图片要求、截止时间、描述字数等）
--   adminConfig      管理员账号（云端只存 passwordHash，不存明文密码）
--   scoringItems     评分项配置
-- ============================================

CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select site_config" ON site_config;
DROP POLICY IF EXISTS "Allow anon insert site_config" ON site_config;
DROP POLICY IF EXISTS "Allow anon update site_config" ON site_config;
DROP POLICY IF EXISTS "Allow anon delete site_config" ON site_config;

CREATE POLICY "Allow anon select site_config"
ON site_config FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow anon insert site_config"
ON site_config FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow anon update site_config"
ON site_config FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow anon delete site_config"
ON site_config FOR DELETE
TO anon, authenticated
USING (true);

-- 让前端 upsert 能按主键判断冲突
CREATE UNIQUE INDEX IF NOT EXISTS site_config_key_idx ON site_config(key);

-- 配置变更实时推送到已打开的管理端页面
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE site_config;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- 验证（执行后可逐条检查）
-- ============================================
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename IN ('judges','site_config');
-- SELECT key, updated_at FROM site_config;
