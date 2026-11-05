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
--         configs 表已存在且 anon 可读，只需放开写权限，前端改为读写云端、本机仅作缓存。
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
-- 【二】configs 表：站点级共享配置（表已存在，只需放开写权限）
-- ============================================
-- 现状：configs 表已存在，anon 可以读取，但写入策略只给了 authenticated，
--       所以管理端修改的投稿规格只能写进本机 localStorage，其他设备看不到。
--
-- 前端使用的 key：
--   submission_specs  投稿规格（视频/图片要求、截止时间、描述字数等）
--   admin_config      管理员账号（云端只存 passwordHash，不存明文密码）
--   scoring_items     评分项配置
--   contest_info      赛事信息（历史数据，前端不会改动）
--
-- 注意：表里已有的 submission_specs 是 2026-10-20 写入的初始化种子数据
--       （字段结构与现在不同，例如 image.minSizeMB=5），前端会自动识别并忽略它，
--       绝不会用它覆盖你当前正在使用的配置。
--       执行完本脚本后，在管理端「作品规格配置」页点一次“保存配置”，
--       即可把当前配置设为全站标准。
-- ============================================

CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configs ENABLE ROW LEVEL SECURITY;

-- 移除只允许 authenticated 写入的旧策略
DROP POLICY IF EXISTS "Authenticated users can update configs" ON configs;
DROP POLICY IF EXISTS "Allow anon insert configs" ON configs;
DROP POLICY IF EXISTS "Allow anon update configs" ON configs;
DROP POLICY IF EXISTS "Allow anon delete configs" ON configs;

-- 读取策略已存在（"Anyone can view configs"），这里只补齐写入相关策略
CREATE POLICY "Allow anon insert configs"
ON configs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow anon update configs"
ON configs FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow anon delete configs"
ON configs FOR DELETE
TO anon, authenticated
USING (true);

-- 配置变更实时推送到已打开的管理端 / 选手端页面
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.configs;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- 验证（执行后可逐条检查）
-- ============================================
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename IN ('judges','configs');
-- SELECT key, updated_at FROM configs ORDER BY key;
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
