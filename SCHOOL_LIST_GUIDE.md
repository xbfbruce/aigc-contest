# 学校列表管理指南

## 📋 当前配置

选手端的学校名称已从文本输入框改为**下拉选择**,支持从配置文件加载学校列表。

### 当前包含的学校(26所)

已预置海珠区主要中小学:
- 广州市海珠区实验小学
- 广州市海珠区第二实验小学
- 广州市海珠区同福中路第一小学
- 广州市海珠区宝玉直实验小学
- ... (共26所,包括"其他学校"选项)

完整列表见: [schools.json](file:///Users/bruce/Desktop/qoder-aigc-contest/schools.json)

---

## 🔧 如何添加/修改学校

### 方法1: 直接编辑JSON文件(推荐)

1. 打开文件: `/Users/bruce/Desktop/qoder-aigc-contest/schools.json`

2. 在 `schools` 数组中添加或删除学校名称:

```json
{
    "schools": [
        "广州市海珠区实验小学",
        "你的新学校名称",  // ← 添加这一行
        "其他学校"
    ]
}
```

3. 保存文件

4. 提交并推送:
```bash
git add schools.json
git commit -m "添加XX学校到学校列表"
git push origin main
```

5. 等待2-3分钟,GitHub Pages会自动更新

### 方法2: 通过管理端上传(待实现)

未来可以在管理端添加一个"学校管理"功能,允许管理员在线编辑学校列表并保存到Supabase数据库。

---

## 🎯 优化内容总结

### 1. 图片上传数量调整
- **之前**: 最多10张
- **现在**: 最多5张
- **原因**: 支持连环画等多图作品,同时避免过多文件

### 2. 单张图片大小限制
- **之前**: 最小5MB(确保高质量)
- **现在**: 最大1MB(避免上传过慢)
- **原因**: 平衡质量和上传速度,适合网络环境

### 3. 删除作品描述字段
- **之前**: 必填,最少50字
- **现在**: 完全移除
- **原因**: 简化表单,加快提交流程

### 4. 学校名称改为下拉选择
- **之前**: 手动输入文本
- **现在**: 从预设列表选择
- **好处**:
  - ✅ 避免拼写错误
  - ✅ 统一学校名称格式
  - ✅ 便于后续统计分析
  - ✅ 如果找不到可以选"其他学校"

---

## 📊 如何在管理端查看学校统计

登录管理端后,可以执行以下SQL查询各学校的参赛作品数:

```sql
SELECT 
    c.school AS "学校",
    COUNT(w.id) AS "作品数量",
    COUNT(DISTINCT c.id) AS "参赛人数"
FROM works w
JOIN contestants c ON w.contestant_id = c.id
GROUP BY c.school
ORDER BY "作品数量" DESC;
```

---

## ⚠️ 注意事项

1. **schools.json必须保持有效的JSON格式**
   - 每个学校名称用双引号包裹
   - 最后一项后面不要加逗号
   - 使用UTF-8编码保存中文

2. **如果学校列表加载失败**
   - 系统会自动降级到内置的默认列表(7所学校)
   - 浏览器控制台会显示错误信息

3. **建议定期备份**
   - 将schools.json复制到安全位置
   - 或者在Supabase中创建schools表存储

---

## 🚀 测试验证

等待GitHub Pages部署完成后:

1. 访问: https://xbfbruce.github.io/aigc-contest/contestant.html
2. 点击"学校"下拉框
3. 应该能看到所有26所学校
4. 尝试选择一所学校并提交表单

如果看不到学校列表,检查浏览器控制台(F12)是否有错误。

---

## 💡 未来改进建议

如果需要更灵活的管理,可以:

1. **在Supabase中创建schools表**
   ```sql
   CREATE TABLE schools (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       name TEXT NOT NULL UNIQUE,
       district TEXT,
       is_active BOOLEAN DEFAULT true,
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **在管理端添加学校管理界面**
   - 添加/删除学校
   - 批量导入Excel
   - 查看各学校参赛统计

3. **支持搜索过滤**
   - 在学校下拉框中添加搜索功能
   - 按区域筛选

如需实现这些功能,随时告诉我!
