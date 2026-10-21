-- ============================================
-- 评审系统升级迁移脚本
-- 功能：0-100分制评分、提交后锁定、自动排名统计
-- ============================================

-- 1. 修改scores表结构，改为单一总分制（0-100）
ALTER TABLE scores DROP COLUMN IF EXISTS creativity_score;
ALTER TABLE scores DROP COLUMN IF EXISTS technical_score;
ALTER TABLE scores DROP COLUMN IF EXISTS visual_score;
ALTER TABLE scores DROP COLUMN IF EXISTS theme_score;
ALTER TABLE scores DROP COLUMN IF EXISTS total_score;

ALTER TABLE scores ADD COLUMN score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100);
ALTER TABLE scores ADD COLUMN is_submitted BOOLEAN DEFAULT FALSE;
ALTER TABLE scores ADD COLUMN submitted_at TIMESTAMPTZ;

-- 2. 添加works表的组别字段索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_works_group ON works(group_name);

-- 3. 创建视图：作品平均分和排名
CREATE OR REPLACE VIEW work_rankings AS
SELECT 
    w.id AS work_id,
    w.title,
    w.group_name,
    w.category,
    c.name AS author_name,
    c.school,
    COUNT(s.id) AS judge_count,
    ROUND(AVG(s.score), 2) AS avg_score,
    RANK() OVER (PARTITION BY w.group_name ORDER BY AVG(s.score) DESC) AS ranking
FROM works w
LEFT JOIN contestants c ON w.contestant_id = c.id
LEFT JOIN assignments a ON a.work_id = w.id
LEFT JOIN scores s ON s.assignment_id = a.id AND s.is_submitted = TRUE
GROUP BY w.id, w.title, w.group_name, w.category, c.name, c.school;

-- 4. 创建函数：获取指定组别的排名
CREATE OR REPLACE FUNCTION get_group_rankings(p_group_name TEXT)
RETURNS TABLE (
    work_id UUID,
    title TEXT,
    author_name TEXT,
    school TEXT,
    judge_count BIGINT,
    avg_score NUMERIC,
    ranking BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wr.work_id,
        wr.title,
        wr.author_name,
        wr.school,
        wr.judge_count,
        wr.avg_score,
        wr.ranking
    FROM work_rankings wr
    WHERE wr.group_name = p_group_name
    ORDER BY wr.avg_score DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 更新RLS策略：评分提交后不可修改
DROP POLICY IF EXISTS "Anyone can update scores" ON scores;
DROP POLICY IF EXISTS "Scores can be updated before submission" ON scores;
DROP POLICY IF EXISTS "Submitted scores are read-only" ON scores;

CREATE POLICY "Scores can be updated before submission" 
ON scores FOR UPDATE 
TO anon, authenticated 
USING (is_submitted = FALSE)
WITH CHECK (is_submitted = FALSE);

-- 注意：提交后的评分通过应用层控制，不在数据库层面强制只读
-- 因为PostgreSQL RLS的WITH CHECK子句无法引用OLD值

-- 6. 添加触发器：提交时记录时间
CREATE OR REPLACE FUNCTION set_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_submitted = TRUE AND OLD.is_submitted = FALSE THEN
        NEW.submitted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_submission_timestamp ON scores;
CREATE TRIGGER trigger_set_submission_timestamp
BEFORE UPDATE ON scores
FOR EACH ROW
EXECUTE FUNCTION set_submission_timestamp();

-- ============================================
-- 迁移完成
-- ============================================
-- 执行后验证：
-- SELECT * FROM work_rankings LIMIT 10;
-- SELECT * FROM get_group_rankings('视频类小学低年级组');
