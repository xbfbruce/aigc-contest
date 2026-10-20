-- ============================================
-- AIGC Contest System - Supabase Database Schema
-- ============================================
-- 使用说明：
-- 1. 在 https://supabase.com 注册账号
-- 2. 创建新项目 "aigc-contest"
-- 3. 进入 SQL Editor
-- 4. 复制本文件全部内容并执行
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 选手表 (contestants)
-- ============================================
CREATE TABLE contestants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    school TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加索引
CREATE INDEX idx_contestants_created_at ON contestants(created_at DESC);

-- 行级安全策略 (RLS)
ALTER TABLE contestants ENABLE ROW LEVEL SECURITY;

-- 允许任何人插入（注册）
CREATE POLICY "Anyone can insert contestants" 
ON contestants FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- 允许所有人读取（用于显示选手信息）
CREATE POLICY "Anyone can view contestants" 
ON contestants FOR SELECT 
TO anon, authenticated 
USING (true);

-- ============================================
-- 2. 作品表 (works)
-- ============================================
CREATE TABLE works (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contestant_id UUID REFERENCES contestants(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('video', 'image')),
    title TEXT NOT NULL,
    description TEXT,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'scored')),
    submit_time TIMESTAMPTZ DEFAULT NOW()
);

-- 添加索引
CREATE INDEX idx_works_contestant ON works(contestant_id);
CREATE INDEX idx_works_category ON works(category);
CREATE INDEX idx_works_status ON works(status);
CREATE INDEX idx_works_submit_time ON works(submit_time DESC);

-- 行级安全策略
ALTER TABLE works ENABLE ROW LEVEL SECURITY;

-- 允许任何人插入作品
CREATE POLICY "Anyone can insert works" 
ON works FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- 允许所有人读取作品
CREATE POLICY "Anyone can view works" 
ON works FOR SELECT 
TO anon, authenticated 
USING (true);

-- 允许管理员删除（通过authenticated角色）
CREATE POLICY "Authenticated users can delete works" 
ON works FOR DELETE 
TO authenticated 
USING (true);

-- ============================================
-- 3. 评委表 (judges)
-- ============================================
CREATE TABLE judges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加索引
CREATE UNIQUE INDEX idx_judges_account ON judges(account);

-- 行级安全策略
ALTER TABLE judges ENABLE ROW LEVEL SECURITY;

-- 只允许authenticated用户读取（管理员）
CREATE POLICY "Authenticated users can view judges" 
ON judges FOR SELECT 
TO authenticated 
USING (true);

-- 只允许authenticated用户插入（管理员创建评委）
CREATE POLICY "Authenticated users can insert judges" 
ON judges FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 只允许authenticated用户删除（管理员删除评委）
CREATE POLICY "Authenticated users can delete judges" 
ON judges FOR DELETE 
TO authenticated 
USING (true);

-- ============================================
-- 4. 分配表 (assignments)
-- ============================================
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    judge_id UUID REFERENCES judges(id) ON DELETE CASCADE,
    work_id UUID REFERENCES works(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(judge_id, work_id)
);

-- 添加索引
CREATE INDEX idx_assignments_judge ON assignments(judge_id);
CREATE INDEX idx_assignments_work ON assignments(work_id);
CREATE UNIQUE INDEX idx_assignments_judge_work ON assignments(judge_id, work_id);

-- 行级安全策略
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取分配关系
CREATE POLICY "Anyone can view assignments" 
ON assignments FOR SELECT 
TO anon, authenticated 
USING (true);

-- 允许authenticated用户插入（管理员分配）
CREATE POLICY "Authenticated users can insert assignments" 
ON assignments FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 允许authenticated用户删除（管理员取消分配）
CREATE POLICY "Authenticated users can delete assignments" 
ON assignments FOR DELETE 
TO authenticated 
USING (true);

-- ============================================
-- 5. 评分表 (scores)
-- ============================================
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    creativity_score INTEGER CHECK (creativity_score >= 0 AND creativity_score <= 100),
    technical_score INTEGER CHECK (technical_score >= 0 AND technical_score <= 100),
    visual_score INTEGER CHECK (visual_score >= 0 AND visual_score <= 100),
    theme_score INTEGER CHECK (theme_score >= 0 AND theme_score <= 100),
    total_score INTEGER,
    comment TEXT,
    scored_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_id)
);

-- 添加索引
CREATE INDEX idx_scores_assignment ON scores(assignment_id);
CREATE INDEX idx_scores_scored_at ON scores(scored_at DESC);

-- 触发器：自动计算总分
CREATE OR REPLACE FUNCTION calculate_total_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_score := COALESCE(NEW.creativity_score, 0) + 
                       COALESCE(NEW.technical_score, 0) + 
                       COALESCE(NEW.visual_score, 0) + 
                       COALESCE(NEW.theme_score, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_total_score
BEFORE INSERT OR UPDATE ON scores
FOR EACH ROW
EXECUTE FUNCTION calculate_total_score();

-- 行级安全策略
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取评分
CREATE POLICY "Anyone can view scores" 
ON scores FOR SELECT 
TO anon, authenticated 
USING (true);

-- 允许所有人插入评分（评委打分）
CREATE POLICY "Anyone can insert scores" 
ON scores FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- 允许所有人更新自己的评分
CREATE POLICY "Anyone can update scores" 
ON scores FOR UPDATE 
TO anon, authenticated 
USING (true);

-- ============================================
-- 6. 配置表 (configs)
-- ============================================
CREATE TABLE configs (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 行级安全策略
ALTER TABLE configs ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取配置
CREATE POLICY "Anyone can view configs" 
ON configs FOR SELECT 
TO anon, authenticated 
USING (true);

-- 只允许authenticated用户更新配置（管理员）
CREATE POLICY "Authenticated users can update configs" 
ON configs FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- ============================================
-- 7. 页面访问统计表 (page_views)
-- ============================================
CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_name TEXT NOT NULL,
    visited_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    referrer TEXT
);

-- 添加索引
CREATE INDEX idx_page_views_page_name ON page_views(page_name);
CREATE INDEX idx_page_views_visited_at ON page_views(visited_at DESC);

-- 行级安全策略
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- 允许所有人插入访问记录
CREATE POLICY "Anyone can insert page views" 
ON page_views FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- 允许authenticated用户读取（管理员查看统计）
CREATE POLICY "Authenticated users can view page views" 
ON page_views FOR SELECT 
TO authenticated 
USING (true);

-- 创建按页面名称统计的函数
CREATE OR REPLACE FUNCTION count_page_views_by_name()
RETURNS TABLE (
    page_name TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT pv.page_name, COUNT(*)::BIGINT as count
    FROM page_views pv
    GROUP BY pv.page_name
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. 初始化默认配置
-- ============================================
INSERT INTO configs (key, value) VALUES
('submission_specs', '{
    "video": {
        "enabled": true,
        "formats": ["MP4"],
        "maxSize": 100,
        "subtitleRequired": true
    },
    "image": {
        "enabled": true,
        "formats": ["JPG", "PNG"],
        "minDPI": 300,
        "minSizeMB": 5
    },
    "deadline": "2026-12-31 23:59:59",
    "maxSubmissionsPerCategory": 3,
    "descriptionMinLength": 50
}'),
('contest_info', '{
    "title": "数智新一代 清风绘未来",
    "subtitle": "2026年海珠区\"清风侠\"AI动漫创作大赛",
    "organizer": "海珠区教育局"
}');

-- ============================================
-- 8. 创建管理员账号（可选）
-- ============================================
-- 注意：这里不直接存储密码，建议通过应用层创建
-- 或者使用Supabase Auth来管理管理员账号

-- ============================================
-- 完成！
-- ============================================
-- 执行完毕后，你应该看到所有表都已创建
-- 可以通过 Table Editor 查看表结构
