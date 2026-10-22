-- ============================================
-- 修复：删除旧的 total_score 触发器
-- 该触发器引用了已删除的 total_score 字段
-- ============================================

-- 删除旧的触发器
DROP TRIGGER IF EXISTS trigger_calculate_total_score ON scores;

-- 删除旧的函数
DROP FUNCTION IF EXISTS calculate_total_score();

-- ============================================
-- 迁移完成
-- ============================================
-- 执行后验证：
-- SELECT * FROM scores LIMIT 1;
-- 应该能正常插入和更新评分记录
