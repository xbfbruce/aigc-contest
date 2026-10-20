# 快速部署到GitHub Pages（5分钟）

## 为什么选择GitHub Pages？

- ✅ **完全免费**
- ✅ **无需服务器维护**
- ✅ **自动HTTPS**
- ✅ **CDN加速**
- ✅ **适合静态网站**

---

## 步骤1：准备Git仓库

```bash
cd /Users/bruce/Desktop/qoder-aigc-contest

# 初始化Git（如果还没有）
git init

# 创建.gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
*.log
.DS_Store
EOF

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: AIGC Contest System with Supabase support"
```

---

## 步骤2：创建GitHub仓库

1. 访问 https://github.com/new
2. 填写信息：
   - **Repository name**: `aigc-contest`
   - **Description**: `2026年海珠区"清风侠"AI动漫创作大赛系统`
   - **Public**: ✅ 选择公开
3. 点击 **Create repository**

---

## 步骤3：推送代码

GitHub会显示推送命令，类似：

```bash
git remote add origin https://github.com/YOUR_USERNAME/aigc-contest.git
git branch -M main
git push -u origin main
```

---

## 步骤4：启用GitHub Pages

1. 在GitHub仓库页面
2. 点击 **Settings** → **Pages**
3. 在 **Source** 下拉框选择：
   - Branch: `main`
   - Folder: `/ (root)`
4. 点击 **Save**

等待约1-2分钟，你的网站就会发布到：
```
https://YOUR_USERNAME.github.io/aigc-contest/
```

---

## 步骤5：配置Supabase（可选但推荐）

编辑 `index.html`、`contestant.html`、`judge.html`、`admin.html`，找到：

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

替换为你实际的Supabase凭证。

---

## 验证部署

1. 访问生成的GitHub Pages URL
2. 测试三个端口：
   - 选手端：提交作品
   - 评委端：查看和评分
   - 管理端：配置系统

---

## 其他部署选项

### Vercel（更简单）
1. 访问 https://vercel.com
2. 导入GitHub仓库
3. 自动部署，获得URL

### Netlify
1. 访问 https://netlify.com
2. 拖拽整个项目文件夹
3. 即刻部署

---

## 分享链接

部署完成后，将以下链接分享给70个参赛选手：

```
选手端：https://YOUR_USERNAME.github.io/aigc-contest/contestant.html
评委端：https://YOUR_USERNAME.github.io/aigc-contest/judge.html
管理端：https://YOUR_USERNAME.github.io/aigc-contest/admin.html
```

**注意**：如果使用了Supabase，所有人都可以访问；如果只用localStorage，每人只能看到自己浏览器的数据。
