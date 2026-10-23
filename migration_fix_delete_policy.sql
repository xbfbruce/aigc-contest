-- ============================================
-- 修复：作品删除权限 + 清理测试数据
-- 问题：DELETE 策略只允许 authenticated 角色，
--       前端使用 anon key，删除操作被静默拒绝（0行被删）
-- ============================================

-- 1. 修复 works 表的 DELETE 策略：允许 anon 和 authenticated
DROP POLICY IF EXISTS "Authenticated users can delete works" ON works;
CREATE POLICY "Anyone can delete works"
ON works FOR DELETE
TO anon, authenticated
USING (true);

-- 2. 补充 scores 表的 DELETE 策略（用于管理端清理评分记录）
DROP POLICY IF EXISTS "Anyone can delete scores" ON scores;
CREATE POLICY "Anyone can delete scores"
ON scores FOR DELETE
TO anon, authenticated
USING (true);

-- 3. 补充 contestants 表的 DELETE 策略（如需清理选手记录）
DROP POLICY IF EXISTS "Anyone can delete contestants" ON contestants;
CREATE POLICY "Anyone can delete contestants"
ON contestants FOR DELETE
TO anon, authenticated
USING (true);

-- ============================================
-- 4. 清理测试数据（恢复"已删除所有作品"的预期状态）
-- 说明：scores 表通过外键 ON DELETE CASCADE 自动清理
-- 如果不想清空作品，请删除下面这一行
-- ============================================
DELETE FROM works;

-- ============================================
-- 迁移完成
-- ============================================
-- 执行后验证：
-- SELECT COUNT(*) FROM works;   -- 应为 0
-- SELECT COUNT(*) FROM scores;  -- 应为 0
