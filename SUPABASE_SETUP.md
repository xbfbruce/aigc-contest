# Supabase 配置指南

## ⚠️ 紧急：必须执行的SQL（修复上传问题）

**代码已修复，现在需要在Supabase中执行以下SQL来启用访问统计功能。**

### 快速执行步骤

1. 打开: https://supabase.com/dashboard/project/pqchakbrsatzxepypkyo
2. 左侧菜单 → **SQL Editor** → **New Query**
3. 复制并执行以下SQL:

```sql
-- ============================================
-- 页面访问统计表 (page_views)
-- ============================================
CREATE TABLE IF NOT EXISTS page_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_name TEXT NOT NULL,
    visited_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_views_page_name ON page_views(page_name);
CREATE INDEX IF NOT EXISTS idx_page_views_visited_at ON page_views(visited_at DESC);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- 允许所有人插入访问记录
DROP POLICY IF EXISTS "Anyone can insert page views" ON page_views;
CREATE POLICY "Anyone can insert page views" 
ON page_views FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- 允许authenticated用户读取（管理员查看统计）
DROP POLICY IF EXISTS "Authenticated users can view page views" ON page_views;
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
```

点击 **Run** 执行。

---

## 🔍 验证权限配置（重要！）

**这是其他人能上传作品的关键！**

在SQL Editor中执行:

```sql
-- 检查所有表的策略
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('works', 'contestants', 'judges', 'assignments', 'scores', 'configs');
```

**必须看到以下策略:**

| 表名 | 策略名 | 操作 | 角色 |
|------|--------|------|------|
| works | Anyone can insert works | INSERT | anon |
| works | Anyone can view works | SELECT | anon |
| contestants | Anyone can insert contestants | INSERT | anon |
| contestants | Anyone can view contestants | SELECT | anon |

**如果缺少任何策略，立即执行:**

```sql
-- works表权限（选手上传作品的必需权限）
DROP POLICY IF EXISTS "Anyone can insert works" ON works;
CREATE POLICY "Anyone can insert works" 
ON works FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view works" ON works;
CREATE POLICY "Anyone can view works" 
ON works FOR SELECT TO anon USING (true);

-- contestants表权限（自动注册选手）
DROP POLICY IF EXISTS "Anyone can insert contestants" ON contestants;
CREATE POLICY "Anyone can insert contestants" 
ON contestants FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view contestants" ON contestants;
CREATE POLICY "Anyone can view contestants" 
ON contestants FOR SELECT TO anon USING (true);
```

---

## 🎯 测试步骤

### 1. 等待GitHub Pages部署完成

访问: https://github.com/xbfbruce/aigc-contest/actions  
确认最新commit显示 ✅

### 2. 让测试用户访问网站

```
https://xbfbruce.github.io/aigc-contest/
```

### 3. 测试上传作品

1. 选择"选手端"
2. 填写姓名、学校
3. 选择作品分类
4. 填写作品标题和描述
5. 上传图片文件
6. 点击"提交作品"

### 4. 验证结果

- ✅ 应该看到"作品提交成功"提示
- ✅ 打开浏览器控制台(F12),应该看到:
  ```
  📝 注册新选手: 张三 XX学校
  ✅ 选手注册成功, ID: xxx-xxx-xxx
  📤 提交作品到Supabase: {...}
  ✅ 作品提交成功: {...}
  ```

### 5. 在管理端查看

1. 访问管理端: `https://xbfbruce.github.io/aigc-contest/admin.html`
2. 登录(admin/admin123)
3. 点击"作品管理"标签
4. 应该能看到新提交的作品

### 6. 测试访问统计

1. 在管理端点击"访问统计"标签
2. 应该能看到:
   - 总访问量
   - 今日访问
   - 各页面访问分布
   - 最近访问记录

---

## 🔧 常见问题

### Q: 提交时显示错误

**检查浏览器控制台(F12)**:

- 如果看到 `permission denied` → RLS策略未配置,执行上面的SQL
- 如果看到 `Network Error` → 检查网络连接
- 如果看到 `relation does not exist` → 表未创建,需要执行完整的schema.sql

### Q: 其他人还是无法上传

1. 让他们清除浏览器缓存(Ctrl+Shift+Delete)
2. 使用无痕模式测试
3. 检查控制台是否有错误信息

### Q: 访问统计显示0

1. 确认已在Supabase中创建了page_views表
2. 刷新几次页面后再查看
3. 检查控制台是否有 "✅ 访问已记录" 日志

---

## 📞 需要帮助?

把浏览器控制台的错误信息截图发给我,我会帮你快速解决!

---

## 完整配置流程（首次设置）

### 1. 注册/登录
访问 https://supabase.com 并注册账号（可以使用GitHub快捷登录）

### 2. 创建新项目
1. 点击 "New Project"
2. 填写项目信息：
   - **Name**: `aigc-contest`
   - **Database Password**: 设置一个强密码（保存好！）
   - **Region**: 选择 `Asia (Singapore)` 或 `Asia (Tokyo)`（国内访问较快）
3. 点击 "Create new project"
4. 等待约1-2分钟，项目创建完成

### 3. 获取项目凭证
创建完成后，你会看到项目Dashboard：
1. 点击左侧菜单的 **Project Settings** (齿轮图标)
2. 点击 **API**
3. 复制以下两个值（稍后需要填入代码）：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

---

## 第二步：执行数据库脚本（3分钟）

### 1. 打开SQL Editor
在Supabase Dashboard中：
1. 点击左侧菜单的 **SQL Editor**
2. 点击 **New query**

### 2. 执行建表脚本
1. 打开文件 `/Users/bruce/Desktop/qoder-aigc-contest/supabase-schema.sql`
2. 复制全部内容
3. 粘贴到SQL Editor中
4. 点击 **Run** 按钮执行
5. 等待执行完成，应该看到所有表都已创建成功

### 3. 验证表结构
点击左侧菜单的 **Table Editor**，你应该看到以下6个表：
- ✅ contestants
- ✅ works
- ✅ judges
- ✅ assignments
- ✅ scores
- ✅ configs

---

## 第三步：创建Storage Bucket（2分钟）

### 1. 进入Storage
点击左侧菜单的 **Storage**

### 2. 创建Bucket
1. 点击 **New bucket**
2. 填写信息：
   - **Name**: `works`
   - **Public**: ✅ 勾选（允许公开读取作品文件）
3. 点击 **Create bucket**

### 3. 配置Bucket策略（可选但推荐）
为了更安全，可以限制上传文件大小：
1. 点击刚创建的 `works` bucket
2. 点击右上角的 **Policies**
3. 点击 **New policy**
4. 选择 **For full customization**
5. 添加规则：
   ```sql
   -- 允许任何人上传（最大10MB）
   CREATE POLICY "Allow uploads up to 10MB"
   ON storage.objects FOR INSERT
   TO anon, authenticated
   WITH CHECK (
       bucket_id = 'works' AND
       (storage.foldername(name))[1] IS NOT NULL
   );
   ```

---

## 第四步：配置前端代码（5分钟）

### 1. 更新Supabase凭证
打开文件 `/Users/bruce/Desktop/qoder-aigc-contest/supabase-client.js`

找到第8-9行：
```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

替换为你刚才复制的实际值：
```javascript
const SUPABASE_URL = 'https://abcdefgh.supabase.co';  // 你的实际URL
const SUPABASE_ANON_KEY = 'eyJhbG...';  // 你的实际anon key
```

### 2. 安装Supabase客户端库
在项目根目录执行：
```bash
cd /Users/bruce/Desktop/qoder-aigc-contest
npm init -y
npm install @supabase/supabase-js
```

或者直接在HTML中通过CDN引入（更简单）：
在所有HTML文件的 `<head>` 中添加：
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

---

## 第五步：修改前端代码

参考下一节的前端改造说明。

---

## 常见问题

### Q: 如何重置数据库？
A: 在 SQL Editor 中执行：
```sql
DROP TABLE IF EXISTS scores CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS works CASCADE;
DROP TABLE IF EXISTS judges CASCADE;
DROP TABLE IF EXISTS contestants CASCADE;
DROP TABLE IF EXISTS configs CASCADE;
```
然后重新执行建表脚本。

### Q: Storage上传失败怎么办？
A: 检查：
1. Bucket是否设置为Public
2. 文件大小是否超过10MB限制
3. 浏览器控制台是否有CORS错误

### Q: 如何查看实时数据？
A: 在 Table Editor 中可以直接查看和编辑数据，也可以启用Realtime功能实现实时更新。

### Q: 免费额度够用吗？
A: Supabase免费层包含：
- 500MB 数据库空间（足够存储数千条记录）
- 1GB 存储空间（可存储约100-200个视频/图片）
- 每月50,000次Edge Functions调用
- 无用户数限制

对于70人的比赛完全够用！

---

## 下一步

完成以上步骤后，继续执行前端代码改造。
