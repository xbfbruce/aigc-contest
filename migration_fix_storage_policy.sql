-- ============================================
-- 修复 Supabase Storage 上传权限问题
-- ============================================
-- 问题：选手上传文件时报错 "new row violates row-level security policy"
-- 原因：storage.objects 表没有允许匿名(anon)用户 INSERT 的策略
-- 修复：确保 works bucket 存在且公开，并为 storage.objects 添加完整的读写策略
-- ============================================

-- 1. 确保 works bucket 存在并且是公开的
INSERT INTO storage.buckets (id, name, public)
VALUES ('works', 'works', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. 清理可能存在的旧策略（避免冲突）
DROP POLICY IF EXISTS "Anyone can upload works" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view works files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update works files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete works files" ON storage.objects;
DROP POLICY IF EXISTS "Public read works" ON storage.objects;
DROP POLICY IF EXISTS "Public insert works" ON storage.objects;

-- 3. 允许任何人上传文件到 works bucket
CREATE POLICY "Anyone can upload works"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'works');

-- 4. 允许任何人读取 works bucket 中的文件
CREATE POLICY "Anyone can view works files"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'works');

-- 5. 允许任何人更新（覆盖）works bucket 中的文件
CREATE POLICY "Anyone can update works files"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'works')
WITH CHECK (bucket_id = 'works');

-- 6. 允许任何人删除 works bucket 中的文件
CREATE POLICY "Anyone can delete works files"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'works');

-- ============================================
-- 验证
-- ============================================
-- 执行后可在 Supabase Dashboard → Storage 中确认 works bucket 存在且 Public 为开启状态
-- 执行: SELECT * FROM storage.buckets WHERE id = 'works';
-- 执行: SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'storage.objects'::regclass;
