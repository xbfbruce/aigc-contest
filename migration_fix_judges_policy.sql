-- ============================================
-- 修复：评委账号无法跨设备使用
-- ============================================
-- 问题原因：
--   judges 表的行级安全策略只授权给 authenticated 角色，
--   而本站前端只使用 anon 密钥，因此：
--     • anon SELECT judges  → 永远返回空数组（策略静默过滤）
--     • anon INSERT judges  → 42501 "new row violates row-level security policy"
--   结果：管理端只能把评委写进本机 localStorage，
--         换一台设备既看不到账号，也无法登录。
--
-- 本脚本为 anon 角色开放 judges 表的读写策略（与本站 works / scores /
-- page_views 等表保持一致的开放策略）。
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴 → Run
-- 可重复执行（幂等）。
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
-- 验证（执行后应返回 4 行策略）
-- ============================================
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'judges';
