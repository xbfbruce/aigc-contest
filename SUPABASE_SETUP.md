# Supabase 配置指南

## 第一步：创建Supabase项目（5分钟）

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
