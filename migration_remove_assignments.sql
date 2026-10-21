-- ============================================
-- 移除分配机制迁移脚本
-- 评委直接按组别查看所有作品并打分
-- ============================================

-- 1. 修改scores表结构：添加work_id和judge_account字段
ALTER TABLE scores ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES works(id) ON DELETE CASCADE;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS judge_account TEXT;

-- 2. 更新现有评分记录：从assignments表获取work_id和judge_id
UPDATE scores s
SET 
    work_id = a.work_id,
    judge_account = j.account
FROM assignments a
JOIN judges j ON a.judge_id = j.id
WHERE s.assignment_id = a.id
AND (s.work_id IS NULL OR s.judge_account IS NULL);

-- 3. 设置NOT NULL约束（数据迁移完成后）
ALTER TABLE scores ALTER COLUMN work_id SET NOT NULL;
ALTER TABLE scores ALTER COLUMN judge_account SET NOT NULL;

-- 4. 创建唯一约束：每个评委对每个作品只能有一个评分
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_work_judge_unique;
ALTER TABLE scores ADD CONSTRAINT scores_work_judge_unique UNIQUE(work_id, judge_account);

-- 5. 添加索引
CREATE INDEX IF NOT EXISTS idx_scores_work_id ON scores(work_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge_account ON scores(judge_account);

-- 6. 更新视图：不再依赖assignments表
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
LEFT JOIN scores s ON s.work_id = w.id AND s.is_submitted = TRUE
GROUP BY w.id, w.title, w.group_name, w.category, c.name, c.school;

-- 7. 更新函数：获取指定组别的排名
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

-- 8. 更新RLS策略
DROP POLICY IF EXISTS "Anyone can view scores" ON scores;
DROP POLICY IF EXISTS "Judges can insert their own scores" ON scores;
DROP POLICY IF EXISTS "Scores can be updated before submission" ON scores;

-- 允许所有人查看评分（用于排名统计）
CREATE POLICY "Anyone can view scores" 
ON scores FOR SELECT 
TO anon, authenticated 
USING (true);

-- 允许评委插入自己的评分
CREATE POLICY "Judges can insert their own scores" 
ON scores FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- 允许评委更新自己未提交的评分
CREATE POLICY "Judges can update unsubmitted scores" 
ON scores FOR UPDATE 
TO anon, authenticated 
USING (is_submitted = FALSE)
WITH CHECK (is_submitted = FALSE);

-- ============================================
-- 迁移完成
-- ============================================
-- 执行后验证：
-- SELECT * FROM scores LIMIT 10;
-- SELECT * FROM work_rankings LIMIT 10;
-- SELECT * FROM get_group_rankings('视频类小学低年级组');
