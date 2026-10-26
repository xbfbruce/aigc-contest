-- ============================================
-- 补齐 works 表缺失的列
-- ============================================
-- 问题：提交作品时报错
--   "Could not find the 'file_metadata' column of 'works' in the schema cache"
-- 原因：works 表建表时没有 file_metadata / created_at 列，而前端提交时写入了它们
-- 修复：用 ADD COLUMN IF NOT EXISTS 补齐（已存在则跳过，可重复执行）
-- ============================================

ALTER TABLE works
    ADD COLUMN IF NOT EXISTS file_metadata TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 顺便补一个方便排序/展示的提交时间列（如已存在则跳过）
ALTER TABLE works
    ADD COLUMN IF NOT EXISTS submit_time TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- 验证：执行后应能看到 file_metadata / created_at / submit_time
-- ============================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'works'
-- ORDER BY ordinal_position;
