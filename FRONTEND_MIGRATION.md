# 前端代码改造指南

## 概述

本文档说明如何将现有的localStorage版本改造为Supabase云端版本。

---

## 改造策略

### 方案A：渐进式改造（推荐）
保留现有localStorage功能作为fallback，同时添加Supabase支持。这样即使Supabase配置未完成，系统仍可本地使用。

### 方案B：完全替换
完全移除localStorage，只使用Supabase。需要确保Supabase已正确配置。

**以下采用方案A**

---

## 第一步：添加Supabase CDN引用

在所有HTML文件的 `<head>` 标签中添加：

```html
<!-- Supabase SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

---

## 第二步：创建统一的Storage适配器

创建新文件 `storage-adapter.js`：

```javascript
/**
 * Storage Adapter
 * 自动选择使用Supabase或localStorage
 */

class StorageAdapter {
    constructor() {
        this.useSupabase = false;
        this.supabase = null;
    }

    // 初始化Supabase
    initSupabase(url, anonKey) {
        try {
            this.supabase = window.supabase.createClient(url, anonKey);
            this.useSupabase = true;
            console.log('✅ Supabase initialized');
        } catch (error) {
            console.warn('⚠️ Supabase init failed, falling back to localStorage:', error);
            this.useSupabase = false;
        }
    }

    // Works操作
    async submitWork(workData) {
        if (this.useSupabase && this.supabase) {
            const { data, error } = await this.supabase
                .from('works')
                .insert([workData])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } else {
            // Fallback to localStorage
            let works = JSON.parse(localStorage.getItem('works') || '[]');
            workData.id = crypto.randomUUID();
            workData.submit_time = new Date().toISOString();
            works.push(workData);
            localStorage.setItem('works', JSON.stringify(works));
            return workData;
        }
    }

    async listWorks(filters = {}) {
        if (this.useSupabase && this.supabase) {
            let query = this.supabase.from('works').select('*');
            
            if (filters.category) query = query.eq('category', filters.category);
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.contestant_id) query = query.eq('contestant_id', filters.contestant_id);
            
            const { data, error } = await query.order('submit_time', { ascending: false });
            if (error) throw error;
            return data || [];
        } else {
            let works = JSON.parse(localStorage.getItem('works') || '[]');
            
            if (filters.category) works = works.filter(w => w.category === filters.category);
            if (filters.status) works = works.filter(w => w.status === filters.status);
            if (filters.contestant_id) works = works.filter(w => w.contestant_id === filters.contestant_id);
            
            return works.sort((a, b) => new Date(b.submit_time) - new Date(a.submit_time));
        }
    }

    async deleteWork(id) {
        if (this.useSupabase && this.supabase) {
            const { error } = await this.supabase.from('works').delete().eq('id', id);
            if (error) throw error;
        } else {
            let works = JSON.parse(localStorage.getItem('works') || '[]');
            works = works.filter(w => w.id !== id);
            localStorage.setItem('works', JSON.stringify(works));
        }
    }

    // Judges操作
    async createJudge(account, password, name) {
        if (this.useSupabase && this.supabase) {
            // 注意：实际应该在server端hash密码
            const { data, error } = await this.supabase
                .from('judges')
                .insert([{ account, password_hash: password, name }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } else {
            let judges = JSON.parse(localStorage.getItem('judges') || '[]');
            const judge = {
                id: crypto.randomUUID(),
                account,
                password, // 不安全，仅用于demo
                name,
                created_at: new Date().toISOString()
            };
            judges.push(judge);
            localStorage.setItem('judges', JSON.stringify(judges));
            return judge;
        }
    }

    async listJudges() {
        if (this.useSupabase && this.supabase) {
            const { data, error } = await this.supabase
                .from('judges')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } else {
            return JSON.parse(localStorage.getItem('judges') || '[]');
        }
    }

    async deleteJudge(id) {
        if (this.useSupabase && this.supabase) {
            const { error } = await this.supabase.from('judges').delete().eq('id', id);
            if (error) throw error;
        } else {
            let judges = JSON.parse(localStorage.getItem('judges') || '[]');
            judges = judges.filter(j => j.id !== id);
            localStorage.setItem('judges', JSON.stringify(judges));
        }
    }

    // Assignments操作
    async createAssignments(judgeId, workIds) {
        if (this.useSupabase && this.supabase) {
            const assignments = workIds.map(workId => ({
                judge_id: judgeId,
                work_id: workId
            }));
            
            const { data, error } = await this.supabase
                .from('assignments')
                .insert(assignments)
                .select();
            
            if (error) throw error;
            return data;
        } else {
            let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
            const newAssignments = workIds.map(workId => ({
                id: crypto.randomUUID(),
                judge_id: judgeId,
                work_id: workId,
                assigned_at: new Date().toISOString()
            }));
            assignments.push(...newAssignments);
            localStorage.setItem('assignments', JSON.stringify(assignments));
            return newAssignments;
        }
    }

    async listAssignments(filters = {}) {
        if (this.useSupabase && this.supabase) {
            let query = this.supabase.from('assignments').select('*');
            
            if (filters.judge_id) query = query.eq('judge_id', filters.judge_id);
            if (filters.work_id) query = query.eq('work_id', filters.work_id);
            
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } else {
            let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
            
            if (filters.judge_id) assignments = assignments.filter(a => a.judge_id === filters.judge_id);
            if (filters.work_id) assignments = assignments.filter(a => a.work_id === filters.work_id);
            
            return assignments;
        }
    }

    // Scores操作
    async submitScore(scoreData) {
        if (this.useSupabase && this.supabase) {
            // 检查是否已存在
            const { data: existing } = await this.supabase
                .from('scores')
                .select('id')
                .eq('assignment_id', scoreData.assignment_id)
                .single();
            
            if (existing) {
                const { data, error } = await this.supabase
                    .from('scores')
                    .update({
                        creativity_score: scoreData.creativity_score,
                        technical_score: scoreData.technical_score,
                        visual_score: scoreData.visual_score,
                        theme_score: scoreData.theme_score,
                        comment: scoreData.comment,
                        updated_at: new Date().toISOString()
                    })
                    .eq('assignment_id', scoreData.assignment_id)
                    .select()
                    .single();
                
                if (error) throw error;
                return data;
            } else {
                const { data, error } = await this.supabase
                    .from('scores')
                    .insert([{
                        assignment_id: scoreData.assignment_id,
                        ...scoreData
                    }])
                    .select()
                    .single();
                
                if (error) throw error;
                return data;
            }
        } else {
            let scores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            
            const existingIndex = scores.findIndex(s => s.assignment_id === scoreData.assignment_id);
            if (existingIndex >= 0) {
                scores[existingIndex] = { ...scores[existingIndex], ...scoreData };
            } else {
                scores.push({
                    id: crypto.randomUUID(),
                    ...scoreData,
                    scored_at: new Date().toISOString()
                });
            }
            
            localStorage.setItem('judgeScores', JSON.stringify(scores));
            return scores[existingIndex >= 0 ? existingIndex : scores.length - 1];
        }
    }

    async listScores(filters = {}) {
        if (this.useSupabase && this.supabase) {
            let query = this.supabase.from('scores').select('*');
            
            if (filters.work_id) {
                // 需要通过assignment关联
                const { data: assignments } = await this.supabase
                    .from('assignments')
                    .select('id')
                    .eq('work_id', filters.work_id);
                
                if (assignments && assignments.length > 0) {
                    const assignmentIds = assignments.map(a => a.id);
                    query = query.in('assignment_id', assignmentIds);
                } else {
                    return [];
                }
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } else {
            let scores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            
            if (filters.work_id) {
                const assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
                const workAssignments = assignments.filter(a => a.work_id === filters.work_id);
                const assignmentIds = workAssignments.map(a => a.id);
                scores = scores.filter(s => assignmentIds.includes(s.assignment_id));
            }
            
            return scores;
        }
    }

    // Configs操作
    async getConfigs() {
        if (this.useSupabase && this.supabase) {
            const { data, error } = await this.supabase.from('configs').select('*');
            if (error) throw error;
            
            const configs = {};
            (data || []).forEach(row => {
                configs[row.key] = row.value;
            });
            return configs;
        } else {
            // 从localStorage读取或使用默认值
            return {
                submission_specs: JSON.parse(localStorage.getItem('submissionSpecs') || '{}'),
                contest_info: JSON.parse(localStorage.getItem('contestInfo') || '{}')
            };
        }
    }

    async updateConfig(key, value) {
        if (this.useSupabase && this.supabase) {
            const { data, error } = await this.supabase
                .from('configs')
                .upsert({ key, value, updated_at: new Date().toISOString() })
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } else {
            localStorage.setItem(key, JSON.stringify(value));
            return { key, value };
        }
    }
}

// 创建全局实例
const storage = new StorageAdapter();

// 导出
if (typeof module !== 'undefined') {
    module.exports = storage;
}
```

---

## 第三步：修改各端口文件

### contestant.html
在底部添加：
```html
<script src="storage-adapter.js"></script>
<script>
// 初始化Supabase（如果已配置）
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

if (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    storage.initSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
}
</script>
```

### contestant.js 关键修改点

找到所有 `localStorage.setItem` 和 `localStorage.getItem` 调用，替换为：

```javascript
// 旧代码
localStorage.setItem('submissions', JSON.stringify(submissions));

// 新代码
await storage.submitWork(workData);
```

```javascript
// 旧代码
const submissions = JSON.parse(localStorage.getItem('submissions') || '[]');

// 新代码
const submissions = await storage.listWorks({ contestant_id: currentContestant.id });
```

### admin.js 关键修改点

```javascript
// 评委管理
async function createJudge() {
    const account = document.getElementById('judgeAccount').value;
    const password = document.getElementById('judgePassword').value;
    const name = document.getElementById('judgeName').value;
    
    try {
        await storage.createJudge(account, password, name);
        alert('评委创建成功');
        loadJudgesTable();
    } catch (error) {
        alert('创建失败：' + error.message);
    }
}

async function loadJudgesTable() {
    const judges = await storage.listJudges();
    // 渲染表格...
}
```

### judge.js 关键修改点

```javascript
// 加载分配的作品
async function loadAssignedWorks() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    const assignments = await storage.listAssignments({ judge_id: currentUser.id });
    
    // 获取作品详情
    const works = await Promise.all(
        assignments.map(a => storage.getWork(a.work_id))
    );
    
    // 渲染列表...
}

// 提交评分
async function submitScore() {
    const scoreData = {
        assignment_id: currentAssignment.id,
        creativity_score: parseInt(document.getElementById('creativityScore').value),
        technical_score: parseInt(document.getElementById('technicalScore').value),
        visual_score: parseInt(document.getElementById('visualScore').value),
        theme_score: parseInt(document.getElementById('themeScore').value),
        comment: document.getElementById('scoreComment').value
    };
    
    try {
        await storage.submitScore(scoreData);
        alert('评分提交成功');
    } catch (error) {
        alert('提交失败：' + error.message);
    }
}
```

---

## 第四步：测试验证

1. **本地测试**（不配置Supabase）
   - 打开index.html
   - 确认localStorage模式正常工作

2. **云端测试**（配置Supabase后）
   - 在HTML中填入真实的SUPABASE_URL和SUPABASE_ANON_KEY
   - 刷新页面
   - 控制台应显示 "✅ Supabase initialized"
   - 尝试提交作品、创建评委等操作
   - 在Supabase Dashboard的Table Editor中查看数据

---

## 注意事项

1. **文件大小限制**: Supabase免费层单文件最大10MB
2. **并发控制**: 70人同时上传可能需要添加loading状态和重试机制
3. **错误处理**: 所有异步操作都要有try-catch
4. **安全性**: 生产环境不要在客户端存储敏感信息

---

## 完成标志

当你看到以下现象时，说明改造成功：
- ✅ 控制台无错误
- ✅ 可以正常提交作品
- ✅ Supabase Table Editor中看到新数据
- ✅ 不同浏览器/设备间数据同步
