# Supabase CDN配置完成 ✅

## 已完成的修改

以下4个HTML文件已成功添加Supabase SDK引用：

1. ✅ [`index.html`](/Users/bruce/Desktop/qoder-aigc-contest/index.html) - 首页
2. ✅ [`contestant.html`](/Users/bruce/Desktop/qoder-aigc-contest/contestant.html) - 选手端
3. ✅ [`judge.html`](/Users/bruce/Desktop/qoder-aigc-contest/judge.html) - 评委端  
4. ✅ [`admin.html`](/Users/bruce/Desktop/qoder-aigc-contest/admin.html) - 管理端

同时，以下3个文件已添加 `storage-adapter.js` 引用：
- ✅ contestant.html
- ✅ judge.html
- ✅ admin.html

---

## 下一步：配置Supabase凭证

### 方法1：在storage-adapter.js中配置（推荐）

打开 [`storage-adapter.js`](/Users/bruce/Desktop/qoder-aigc-contest/storage-adapter.js) 文件，找到第8-9行：

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

替换为你实际的Supabase项目凭证：

```javascript
const SUPABASE_URL = 'https://abcdefgh.supabase.co';  // 你的实际URL
const SUPABASE_ANON_KEY = 'eyJhbG...';  // 你的实际anon key
```

### 方法2：直接在HTML中配置

在每个HTML文件的 `<head>` 中，CDN引用之后添加：

```html
<script>
// Supabase配置
window.SUPABASE_CONFIG = {
    url: 'https://你的项目ID.supabase.co',
    anonKey: '你的anon-key'
};
</script>
```

---

## 验证是否成功

1. **打开浏览器**
2. **按F12打开开发者工具**
3. **切换到Console标签**
4. **打开任意HTML文件**（如 index.html）

你应该看到：
```
✅ Supabase已加载
```

如果没有看到或出现错误，检查：
- 网络连接是否正常
- CDN链接是否正确
- 浏览器是否阻止了外部脚本

---

## 获取Supabase凭证

如果你还没有创建Supabase项目：

1. 访问 https://supabase.com
2. 注册/登录账号
3. 点击 "New Project"
4. 填写项目信息并创建
5. 进入项目后，点击左侧 **Project Settings** → **API**
6. 复制以下两个值：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

---

## 测试连接

配置完成后，在浏览器控制台输入：

```javascript
// 测试Supabase连接
supabase.from('configs').select('*').then(console.log);
```

如果返回配置数据，说明连接成功！🎉

---

## 当前状态

- ✅ Supabase SDK已通过CDN加载
- ✅ storage-adapter.js已引入所有页面
- ⏳ 等待你配置Supabase凭证
- ⏳ 等待执行数据库脚本（supabase-schema.sql）
- ⏳ 等待创建Storage Bucket

完成上述配置后，系统就可以支持70人并发使用了！
