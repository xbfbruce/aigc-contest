-- ============================================
-- 开启 scores / works 表的 Realtime 推送
-- ============================================
-- 作用：管理端【实时评分】【作品管理】【排名】页签可在评委打分/选手提交后
--       秒级自动刷新（Supabase Realtime websocket 推送）
-- 说明：即使不执行本脚本，前端也有 20 秒轮询兜底，数据仍会自动更新，
--       只是延迟从"秒级"变为"≤20秒"。执行后为推送级实时。
-- 可重复执行：已加入 publication 的表会自动跳过
-- ============================================

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
EXCEPTION
    WHEN duplicate_object THEN NULL;  -- 已在 publication 中
    WHEN undefined_table  THEN NULL;  -- 表不存在
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.works;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- 让 UPDATE 事件携带完整行数据（便于前端直接取用，非必须）
ALTER TABLE public.scores REPLICA IDENTITY FULL;
ALTER TABLE public.works REPLICA IDENTITY FULL;

-- ============================================
-- 验证
-- ============================================
-- SELECT schemaname, tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
-- 应能看到 public.scores 与 public.works
