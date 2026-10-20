# AIGC大赛系统 - 云端部署指南

## 已完成的工作

✅ **数据库已创建并配置**
- 6个核心表：contestants, works, judges, assignments, scores, configs
- Schema版本: 1
- 访问策略：公开读取works和configs

✅ **后端API已开发**
- RESTful API端点（位于 `/app/index.ts`）
- 支持用户认证、作品管理、评分系统、分配管理
- Edge Functions代码已就绪

✅ **API客户端库已创建**
- `api-client.js` 封装所有API调用
- 可替换现有localStorage操作

✅ **云资源配置**
- Database: Ready (schema_version: 1)
- Storage: Ready  
- Functions: Ready

## 下一步：完成前端改造和发布

### 方案A：快速上线（推荐用于演示）

由于当前localStorage版本已经可以工作，你可以：

1. **直接使用本地版本进行测试**
   ```bash
   open /Users/bruce/Desktop/qoder-aigc-contest/index.html
   ```

2. **局限性**
   - 数据仅存储在浏览器本地
   - 无法跨设备同步
   - 不适合70人并发使用

### 方案B：完整云端部署（生产环境）

#### 步骤1：修改前端代码对接API

需要修改以下文件，将localStorage调用替换为API调用：

** contestant.js **
```javascript
// 旧代码（localStorage）
localStorage.setItem('submissions', JSON.stringify(submissions));

// 新代码（API）
await api.submitWork({
  contestant_id: contestantId,
  category: formData.get('category'),
  title: formData.get('workTitle'),
  description: formData.get('description'),
  file_name: file.name,
  file_size: file.size,
  file_url: uploadedFileUrl, // 从Storage获取
});
```

** judge.js **
```javascript
// 旧代码
const assignments = JSON.parse(localStorage.getItem('assignments') || '[]');

// 新代码
const { assignments } = await api.listAssignments({ judge_id: currentJudge.id });
```

** admin.js **
```javascript
// 评委管理
await api.createJudge(account, password, name);
await api.deleteJudge(judgeId);

// 作品分配
await api.createAssignments(judgeId, selectedWorkIds);

// 查看分数
const { scores } = await api.listScores({ work_id: workId });
```

#### 步骤2：配置文件上传到Storage

由于视频/图片文件较大，需要使用云存储：

```javascript
// 在 contestant.js 中
async function uploadFileToStorage(file) {
  // 这里需要通过后端API中转上传
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });
  
  return await response.json(); // 返回 file_url
}
```

#### 步骤3：通过Qoder Desktop发布

在Qoder Desktop应用中：

1. 打开项目目录 `/Users/bruce/Desktop/qoder-aigc-contest`
2. 确保所有文件已保存
3. 使用Sites功能发布网站
4. 验证Functions和Database状态

发布后会获得类似这样的URL：
```
https://aigc-contest-a7syygamnfc.qoder.website
```

## API文档

### 认证接口

**登录**
```
POST /api/auth/login
Body: { account, password, role }
Response: { success, user: { id, name, role } }
```

**注册选手**
```
POST /api/auth/register  
Body: { name, school }
Response: { success, contestant: { id, name, school } }
```

### 作品接口

**提交作品**
```
POST /api/works
Body: { contestant_id, category, title, description, file_name, file_size, file_url }
Response: { success, work }
```

**查询作品列表**
```
GET /api/works?category=video&status=pending
Response: { works: [...] }
```

### 评分接口

**提交评分**
```
POST /api/scores
Body: { assignment_id, creativity_score, technical_score, visual_score, theme_score, comment }
Response: { success, score: { assignment_id, total_score } }
```

**查询评分**
```
GET /api/scores?work_id=xxx&judge_id=yyy
Response: { scores: [...] }
```

### 管理接口

**创建评委**
```
POST /api/judges
Body: { account, password, name }
Response: { success, judge }
```

**分配作品**
```
POST /api/assignments
Body: { judge_id, work_ids: [...] }
Response: { success, assignments }
```

**获取配置**
```
GET /api/configs
Response: { configs: { key: value } }
```

**更新配置**
```
PUT /api/configs/:key
Body: { value }
Response: { success, key, value }
```

## 默认管理员账号

```
账号: admin
密码: admin123
```

⚠️ **重要**: 首次使用后请立即修改默认密码！

## 注意事项

1. **文件大小限制**: Storage单文件最大10MB，视频可能需要压缩或分段上传
2. **并发控制**: 70人同时上传需要考虑限流和队列
3. **安全性**: 生产环境需要使用HTTPS和更强的密码哈希
4. **备份**: 定期导出数据库备份

## 技术支持

如需进一步帮助，请查看：
- Qoder Sites文档
- Database迁移指南
- Functions开发参考

---

**当前状态**: 后端已完成，等待前端改造和正式发布
**预计工作量**: 前端改造约2-3小时，测试1小时
