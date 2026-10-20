# 选手登录和提交限制说明

## 🎯 已实现的功能

### 1. 选手预录入名单
系统已预录入13名测试选手,存储在 [contestants.json](file:///Users/bruce/Desktop/qoder-aigc-contest/contestants.json)

**测试选手名单:**
- 于泓毅
- 袁迎嫣
- 江珈乐
- 伍千印
- 龙景云
- 丘沛霖
- 李翊安
- 熊天然
- 邝泇曈
- 邝加殷
- 陈桐锐
- 朱晋延
- 何造毓

### 2. 登录验证机制

#### 登录方式
选手可以使用以下任一方式登录:
- **姓名**: 输入完整姓名(如"于泓毅")
- **手机号**: 如果配置了手机号,也可使用手机号登录

#### 登录流程
1. 访问选手端页面
2. 在登录框输入姓名或手机号
3. 点击"登录"按钮
4. 系统自动验证并填充信息

#### 登录成功后
- ✅ 自动隐藏登录界面
- ✅ 显示作品提交表单
- ✅ 姓名和学校字段自动填充且**不可修改**
- ✅ 防止冒名顶替

### 3. 提交限制规则

#### 规则1: 每人只能提交一次
- ❌ 首次提交后,再次登录会看到"您已成功提交作品"提示
- ❌ 无法重新提交或修改已提交的内容
- ✅ 显示已提交作品的详细信息

#### 规则2: 每种类型只能选一种
- ❌ 如果之前提交了视频作品,不能再提交图像作品
- ❌ 如果之前提交了图像作品,不能再提交视频作品
- ✅ 确保每个选手只参与一个类别

### 4. 学校列表更新

已更新为指定的10所海珠区学校:
1. 广州海珠外国语实验中学附属第二小学
2. 广州市海珠区晓园小学
3. 广州市宝玉直小学
4. 广州市海珠区宝玉直实验小学
5. 广州市海珠区绿翠小学
6. 广州市海珠区昌岗中路小学
7. 广州市南武中学附属学校
8. 广州市逸景第一小学
9. 广州市海珠区大元帅府小学
10. 其他学校

---

## 🔧 如何管理选手名单

### 添加新选手

编辑 `contestants.json` 文件:

```json
{
    "contestants": [
        {
            "name": "张三",
            "phone": "13800138000",  // 可选,用于登录
            "school": "广州市XX小学"   // 可选,会自动填充
        },
        {
            "name": "李四",
            "phone": "",
            "school": ""
        }
    ]
}
```

然后提交:
```bash
git add contestants.json
git commit -m "添加新选手张三"
git push origin main
```

### 批量导入

如果有Excel名单,可以:
1. 将Excel转换为JSON格式
2. 替换 `contestants.json` 中的 `contestants` 数组
3. 确保每个选手有 `name` 字段

---

## 🚀 测试步骤

### 测试1: 正常登录和提交

1. 访问: https://xbfbruce.github.io/aigc-contest/contestant.html
2. 输入测试姓名: "于泓毅"
3. 点击登录
4. 填写作品信息并提交
5. 刷新页面或重新访问
6. 再次输入"于泓毅"登录
7. 应该看到"您已成功提交作品"提示

### 测试2: 类型限制

1. 用新选手"袁迎嫣"登录
2. 选择"视频作品"分类并提交
3. 清除浏览器缓存或使用无痕模式
4. 用另一个新选手"江珈乐"登录
5. 尝试选择"图像作品"分类
6. 应该可以正常提交(不同选手不受影响)

### 测试3: 未授权选手

1. 输入一个不在名单中的名字(如"测试用户")
2. 点击登录
3. 应该看到"未找到匹配的选手"错误提示

---

## 📊 数据库查询

### 查看各选手提交状态

在Supabase SQL Editor中执行:

```sql
SELECT 
    c.name AS "选手姓名",
    c.school AS "学校",
    w.title AS "作品标题",
    w.category AS "作品类型",
    w.submit_time AS "提交时间",
    CASE 
        WHEN w.id IS NOT NULL THEN '✅ 已提交'
        ELSE '❌ 未提交'
    END AS "状态"
FROM (
    SELECT DISTINCT name, school FROM contestants
) c
LEFT JOIN works w ON w.contestant_id = c.id
ORDER BY "状态", c.name;
```

### 统计提交情况

```sql
SELECT 
    COUNT(DISTINCT c.id) AS "总选手数",
    COUNT(w.id) AS "已提交数",
    COUNT(DISTINCT c.id) - COUNT(w.id) AS "未提交数",
    ROUND(COUNT(w.id)::numeric / COUNT(DISTINCT c.id)::numeric * 100, 1) AS "提交率%"
FROM contestants c
LEFT JOIN works w ON w.contestant_id = c.id;
```

---

## ⚠️ 注意事项

### 1. 选手数据同步
- `contestants.json` 是前端验证用的白名单
- Supabase中的 `contestants` 表是实际存储选手信息的数据库
- 建议在管理端添加"批量导入选手"功能来同步两者

### 2. 安全性
- 当前实现是基于姓名的简单验证
- 生产环境建议添加手机验证码或密码
- 可以考虑集成Supabase Auth进行更安全的认证

### 3. 数据一致性
- 选手登录后,姓名和学校会被锁定
- 这些信息会用于创建 `contestants` 记录
- 确保 `contestants.json` 中的学校名称与下拉列表一致

### 4. 已提交选手的管理
如果需要允许某个选手重新提交:
1. 在Supabase中删除其作品记录:
   ```sql
   DELETE FROM works WHERE contestant_id = '选手ID';
   ```
2. 清除该选手的localStorage记录

---

## 💡 未来改进建议

1. **添加管理员审核流程**
   - 选手提交后进入"待审核"状态
   - 管理员可以在后台批准或拒绝

2. **支持作品修改申请**
   - 选手可以申请修改已提交的作品
   - 需要管理员批准后才能重新提交

3. **增强身份验证**
   - 添加手机短信验证码
   - 或使用微信扫码登录

4. **实时提交流水**
   - 记录每次提交的IP地址、时间戳
   - 防止恶意刷提交

如需实现这些功能,随时告诉我!
