-- ============================================
-- 修复访问统计：page_views 表 RLS 阻止匿名写入
-- ============================================
-- 问题：管理端【访问统计】总访问量/今日访问/各页面访问量始终为 0
-- 原因：page_views 表启用了 RLS 但没有允许 anon INSERT/SELECT 的策略，
--       前端 recordPageView() 插入时被拒 (42501 new row violates row-level security)
-- 修复：为 page_views 添加 anon/authenticated 的 INSERT 与 SELECT 策略
-- ============================================

-- 清理可能存在的旧策略
DROP POLICY IF EXISTS "Anyone can insert page views" ON page_views;
DROP POLICY IF EXISTS "Anyone can view page views" ON page_views;

-- 允许任何人记录访问
CREATE POLICY "Anyone can insert page views"
ON page_views FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 允许任何人读取访问统计（管理端展示用）
CREATE POLICY "Anyone can view page views"
ON page_views FOR SELECT
TO anon, authenticated
USING (true);

-- ============================================
-- 验证
-- ============================================
-- 执行后刷新任意前台页面，再回到管理端【访问统计】点"刷新数据"，
-- 总访问量应开始累加，各页面访问量表格应出现记录。
-- SELECT count(*) FROM page_views;
