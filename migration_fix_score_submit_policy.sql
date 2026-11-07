-- ============================================
-- 修复：暂存评分后正式提交报
--   "new row violates row-level security policy for table \"scores\""
--
-- 原因：scores 表的 UPDATE 策略写成
--   USING (is_submitted = FALSE) WITH CHECK (is_submitted = FALSE)
-- WITH CHECK 约束的是「更新之后」的行，因此把 is_submitted 从 false 改成 true
-- （也就是"暂存 → 正式提交锁定"这一步）永远违反策略，被数据库拒绝。
-- 暂存(false→false)能成功、提交(false→true)必失败，与线上现象完全一致。
--
-- 修复：保留 USING (is_submitted = FALSE) —— 已提交的评分依然不可见、不可改（锁定语义不变）；
--       把 WITH CHECK 放宽为 true —— 允许"未提交 → 已提交"这一次锁定动作。
--
-- 在 Supabase 控制台 → SQL Editor 中整段执行一次即可，可重复执行（幂等）。
-- ============================================

BEGIN;

-- 1. 重建 UPDATE 策略（兼容历史上出现过的三个策略名）
DROP POLICY IF EXISTS "Judges can update unsubmitted scores" ON scores;
DROP POLICY IF EXISTS "Scores can be updated before submission" ON scores;
DROP POLICY IF EXISTS "Anyone can update scores" ON scores;

CREATE POLICY "Judges can update unsubmitted scores"
ON scores FOR UPDATE
TO anon, authenticated
USING (is_submitted = FALSE)      -- 只能更新「尚未提交」的评分：提交后锁定
WITH CHECK (true);                 -- 允许本次更新把 is_submitted 置为 true 完成锁定

-- 2. 顺带补齐：直接以 is_submitted=TRUE 插入的行也记录 submitted_at
CREATE OR REPLACE FUNCTION set_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_submitted = TRUE AND (TG_OP = 'INSERT' OR OLD.is_submitted = FALSE) THEN
        NEW.submitted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_submission_timestamp ON scores;
CREATE TRIGGER trigger_set_submission_timestamp
BEFORE INSERT OR UPDATE ON scores
FOR EACH ROW
EXECUTE FUNCTION set_submission_timestamp();

COMMIT;

-- ============================================
-- 执行后验证（应返回 1 行新策略，with_check 为 true）：
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'scores' AND cmd = 'UPDATE';
-- ============================================
