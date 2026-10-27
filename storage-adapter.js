/**
 * Storage Adapter - 智能存储适配器
 * 
 * 自动选择使用Supabase或localStorage
 * 支持无缝降级机制
 */

class StorageAdapter {
    constructor() {
        this.useSupabase = false;
        this.supabase = null;
        
        // 尝试初始化Supabase
        this.initSupabase();
    }

    /**
     * 初始化Supabase客户端
     */
    initSupabase() {
        try {
            // ⚠️ 重要：将以下两个值替换为你的Supabase项目实际凭证
            const SUPABASE_URL = 'https://pqchakbrsatzxepypkyo.supabase.co';
            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2hha2Jyc2F0enhlcHlwa3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTg5MTQsImV4cCI6MjEwODAzNDkxNH0.Zn38gYyaRGfiGnk9AVeCFxBa0VmqXIXuJq_3MTHGOhU';
            
            // 检查是否已配置
            if (SUPABASE_URL.includes('your-project') || SUPABASE_ANON_KEY.includes('your-anon')) {
                console.warn('⚠️ Supabase未配置，请使用localStorage模式');
                console.warn('请编辑 storage-adapter.js 文件，填入你的Supabase凭证');
                this.useSupabase = false;
                return;
            }
            
            // 检查window.supabase是否存在
            if (typeof window.supabase === 'undefined') {
                console.warn('⚠️ Supabase SDK未加载，使用localStorage模式');
                this.useSupabase = false;
                return;
            }
            
            // 创建Supabase客户端
            this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            this.supabaseUrl = SUPABASE_URL;
            this.supabaseAnonKey = SUPABASE_ANON_KEY;
            this.useSupabase = true;
            console.log('✅ Supabase已成功初始化');
            console.log('📊 当前模式:', this.useSupabase ? '云端模式 (Supabase)' : '本地模式 (localStorage)');
            
        } catch (error) {
            console.error('❌ Supabase初始化失败:', error);
            console.warn('⚠️ 降级到localStorage模式');
            this.useSupabase = false;
        }
    }

    // ============================================
    // Works 操作
    // ============================================

    async submitWork(workData) {
        if (this.useSupabase && this.supabase) {
            let payload = { ...workData };
            
            // 最多重试 5 次：若数据库缺少某列(42703)，自动剔除该列后重试，
            // 保证旧库结构下提交依然成功（file_metadata 等增强列缺失时降级）
            for (let attempt = 0; attempt < 5; attempt++) {
                const { data, error } = await this.supabase
                    .from('works')
                    .insert([payload])
                    .select()
                    .single();
                
                if (!error) return data;
                
                const missingCol = this._extractMissingColumn(error);
                if (missingCol && missingCol in payload) {
                    console.warn(`⚠️ works 表缺少列 "${missingCol}"，已自动剔除后重试`);
                    delete payload[missingCol];
                    continue;
                }
                throw error;
            }
            throw new Error('提交失败：数据库列不匹配，重试次数已用尽');
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

    /**
     * 从 PostgREST 错误中提取缺失的列名
     * 例: "Could not find the 'file_metadata' column of 'works' in the schema cache"
     * 或: "column works.file_metadata does not exist"
     * @returns {string|null}
     */
    _extractMissingColumn(error) {
        if (!error) return null;
        const msg = `${error.message || ''} ${error.details || ''}`;
        let m = msg.match(/Could not find the '([^']+)' column/);
        if (m) return m[1];
        m = msg.match(/column [\w".]+\.([\w"]+) does not exist/);
        if (m) return m[1].replace(/"/g, '');
        if (error.code === '42703') {
            m = msg.match(/'([^']+)'/);
            if (m) return m[1];
        }
        return null;
    }

    /**
     * 生成 UUID（兼容不支持 crypto.randomUUID 的旧设备，如 iOS < 15.4）
     */
    _uuid() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 上传文件到 Supabase Storage
     * 主通道为 XHR（支持实时进度回调，用于进度条），失败后回退 supabase-js fetch 通道；
     * 两个通道均带重试，兼容平板/弱网环境
     * @param {File} file - 要上传的文件
     * @param {string} bucket - Storage bucket 名称，默认 'works'
     * @param {Function} [onProgress] - 进度回调 ({loaded, total})，loaded/total 为字节数
     * @returns {Promise<{path: string, url: string, name: string, size: number}>}
     */
    async uploadFile(file, bucket = 'works', onProgress = null) {
        if (!this.useSupabase || !this.supabase) {
            throw new Error('Supabase 不可用，无法上传文件');
        }

        // 体积预检：超过 50MB 直接给出明确提示，避免平板上出现难懂的 Failed to fetch
        const MAX_BYTES = 50 * 1024 * 1024;
        if (file.size > MAX_BYTES) {
            const mb = (file.size / 1024 / 1024).toFixed(1);
            throw new Error(`文件《${file.name}》大小为 ${mb}MB，超过 50MB 上传限制，请压缩后再上传`);
        }

        const fileExt = (file.name.split('.').pop() || 'bin').toLowerCase();
        const filePath = `${this._uuid()}.${fileExt}`;

        // 平板(iPad/Safari)从相册/文件App选中的可能是"占位引用"，直接交给 fetch 上传
        // 会在传输中途失败并抛出难懂的 "TypeError: Failed to fetch"。
        // 这里先把文件完整读入内存生成稳定 Blob：读取失败能立刻给出明确提示，
        // 且后续重试不会因为引用失效而反复失败。
        let payload = file;
        try {
            const buffer = await file.arrayBuffer();
            payload = new Blob([buffer], { type: file.type || 'application/octet-stream' });
        } catch (readErr) {
            console.warn('⚠️ 无法读取文件内容，将直接使用原始 File 对象:', readErr);
        }

        let lastError = null;

        // 主通道：XHR 直传（可上报进度），重试 3 次
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await this._uploadViaXHR(bucket, filePath, payload, file.type, onProgress);
                return this._publicResult(bucket, filePath, file);
            } catch (e) {
                lastError = e;
                console.warn(`⚠️ XHR 上传尝试 ${attempt} 失败:`, e.message || e);
            }
            if (attempt < 3) await new Promise(r => setTimeout(r, 1200 * attempt));
        }

        // 兜底通道：supabase-js（fetch，无进度回调）
        try {
            console.log('🔄 XHR 通道失败，改用 supabase-js 通道上传...');
            const { error } = await this.supabase.storage
                .from(bucket)
                .upload(filePath, payload, {
                    cacheControl: '3600',
                    upsert: true,
                    contentType: file.type || 'application/octet-stream'
                });
            if (!error) return this._publicResult(bucket, filePath, file);
            lastError = error;
        } catch (e) {
            lastError = e;
            console.error('❌ supabase-js 上传也失败:', e);
        }

        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        throw new Error(
            `文件《${file.name}》(${sizeMB}MB) 上传失败：${lastError?.message || lastError || '网络错误'}。` +
            `请检查网络后重试；若使用平板，请尽量连接 Wi-Fi 并控制文件在 50MB 以内`
        );
    }

    /**
     * 用 XMLHttpRequest 直传 Storage（主通道，支持进度回调）
     */
    _uploadViaXHR(bucket, filePath, payload, contentType, onProgress = null) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${this.supabaseUrl}/storage/v1/object/${bucket}/${filePath}`, true);
            xhr.setRequestHeader('apikey', this.supabaseAnonKey);
            xhr.setRequestHeader('Authorization', `Bearer ${this.supabaseAnonKey}`);
            xhr.setRequestHeader('x-upsert', 'true');
            xhr.setRequestHeader('cache-control', '3600');
            xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
            xhr.timeout = 5 * 60 * 1000;
            if (onProgress && xhr.upload) {
                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) onProgress({ loaded: ev.loaded, total: ev.total });
                };
            }
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
                else reject(new Error(`上传接口返回 ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
            };
            xhr.onerror = () => reject(new Error('XHR 网络错误'));
            xhr.ontimeout = () => reject(new Error('上传超时'));
            xhr.send(payload);
        });
    }

    _publicResult(bucket, filePath, file) {
        const { data: { publicUrl } } = this.supabase.storage.from(bucket).getPublicUrl(filePath);
        return { path: filePath, url: publicUrl, name: file.name, size: file.size };
    }

    async listWorks(filters = {}) {
        if (this.useSupabase && this.supabase) {
            let query = this.supabase
                .from('works')
                .select(`
                    *,
                    contestants (
                        name,
                        school
                    )
                `);
            
            if (filters.category) query = query.eq('category', filters.category);
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.contestant_id) query = query.eq('contestant_id', filters.contestant_id);
            if (filters.contestant_name) {
                // 按选手姓名查询,需要join contestants表
                query = query.eq('contestants.name', filters.contestant_name);
            }
            if (filters.group_name) {
                // 按组别查询
                query = query.eq('group_name', filters.group_name);
            }
            
            query = query.order('submit_time', { ascending: false });
            
            const { data, error } = await query;
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

    async getWork(id) {
        if (this.useSupabase && this.supabase) {
            const { data, error } = await this.supabase
                .from('works')
                .select(`
                    *,
                    contestants (
                        name,
                        school
                    )
                `)
                .eq('id', id)
                .single();
            
            if (error) throw error;
            return data;
        } else {
            const works = JSON.parse(localStorage.getItem('works') || '[]');
            return works.find(w => w.id === id);
        }
    }

    async deleteWork(id) {
        if (this.useSupabase && this.supabase) {
            const { error } = await this.supabase
                .from('works')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
        } else {
            let works = JSON.parse(localStorage.getItem('works') || '[]');
            works = works.filter(w => w.id !== id);
            localStorage.setItem('works', JSON.stringify(works));
        }
    }

    // ============================================
    // Contestants 操作
    // ============================================

    async registerContestant(name, school) {
        if (this.useSupabase && this.supabase) {
            // 先查询选手是否已存在
            const { data: existing, error: queryError } = await this.supabase
                .from('contestants')
                .select('id, name, school')
                .eq('name', name)
                .single();
            
            if (!queryError && existing) {
                // 选手已存在，直接返回
                console.log('✅ 选手已存在:', existing.name);
                return existing;
            }
            
            // 选手不存在，创建新记录
            const { data, error } = await this.supabase
                .from('contestants')
                .insert([{ name, school }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } else {
            // localStorage模式下直接返回模拟数据
            return {
                id: crypto.randomUUID(),
                name,
                school,
                created_at: new Date().toISOString()
            };
        }
    }

    // ============================================
    // Judges 操作
    // ============================================

    async createJudge(account, password, name) {
        if (this.useSupabase && this.supabase) {
            // 简单hash密码（生产环境应使用bcrypt）
            const passwordHash = await this.hashPassword(password);
            
            const { data, error } = await this.supabase
                .from('judges')
                .insert([{ account, password_hash: passwordHash, name }])
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
            const { error } = await this.supabase
                .from('judges')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
        } else {
            let judges = JSON.parse(localStorage.getItem('judges') || '[]');
            judges = judges.filter(j => j.id !== id);
            localStorage.setItem('judges', JSON.stringify(judges));
        }
    }

    async loginJudge(account, password) {
        if (this.useSupabase && this.supabase) {
            const passwordHash = await this.hashPassword(password);
            
            const { data, error } = await this.supabase
                .from('judges')
                .select('*')
                .eq('account', account)
                .eq('password_hash', passwordHash)
                .single();
            
            if (error || !data) {
                throw new Error('账号或密码错误');
            }
            
            return data;
        } else {
            const judges = JSON.parse(localStorage.getItem('judges') || '[]');
            const judge = judges.find(j => j.account === account && j.password === password);
            
            if (!judge) {
                throw new Error('账号或密码错误');
            }
            
            return judge;
        }
    }

    // ============================================
    // Assignments 操作
    // ============================================

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
            let query = this.supabase
                .from('assignments')
                .select(`
                    *,
                    judges (name),
                    works (title, category)
                `);
            
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

    async deleteAssignment(judgeId, workId) {
        if (this.useSupabase && this.supabase) {
            const { error } = await this.supabase
                .from('assignments')
                .delete()
                .eq('judge_id', judgeId)
                .eq('work_id', workId);
            
            if (error) throw error;
        } else {
            let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
            assignments = assignments.filter(a => !(a.judge_id === judgeId && a.work_id === workId));
            localStorage.setItem('assignments', JSON.stringify(assignments));
        }
    }

    // ============================================
    // Scores 操作
    // ============================================

    async submitScore(scoreData) {
        if (this.useSupabase && this.supabase) {
            // 检查是否已存在评分
            const { data: existing } = await this.supabase
                .from('scores')
                .select('id')
                .eq('assignment_id', scoreData.assignment_id)
                .single();
            
            let result;
            
            if (existing) {
                // 更新现有评分
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
                result = data;
            } else {
                // 插入新评分
                const { data, error } = await this.supabase
                    .from('scores')
                    .insert([{
                        assignment_id: scoreData.assignment_id,
                        creativity_score: scoreData.creativity_score,
                        technical_score: scoreData.technical_score,
                        visual_score: scoreData.visual_score,
                        theme_score: scoreData.theme_score,
                        comment: scoreData.comment
                    }])
                    .select()
                    .single();
                
                if (error) throw error;
                result = data;
            }
            
            return result;
        } else {
            let scores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            
            const existingIndex = scores.findIndex(s => s.assignment_id === scoreData.assignment_id);
            
            const scoreRecord = {
                id: existingIndex >= 0 ? scores[existingIndex].id : crypto.randomUUID(),
                ...scoreData,
                scored_at: existingIndex >= 0 ? scores[existingIndex].scored_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            if (existingIndex >= 0) {
                scores[existingIndex] = scoreRecord;
            } else {
                scores.push(scoreRecord);
            }
            
            localStorage.setItem('judgeScores', JSON.stringify(scores));
            return scoreRecord;
        }
    }

    async listScores(filters = {}) {
        if (this.useSupabase && this.supabase) {
            let query = this.supabase
                .from('scores')
                .select(`
                    *,
                    assignments!inner (
                        judges (name),
                        works (title)
                    )
                `);
            
            if (filters.work_id) {
                query = query.eq('assignments.works.id', filters.work_id);
            }
            if (filters.judge_id) {
                query = query.eq('assignments.judges.id', filters.judge_id);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } else {
            let scores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            
            if (filters.work_id || filters.judge_id) {
                const assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
                const works = JSON.parse(localStorage.getItem('works') || '[]');
                const judges = JSON.parse(localStorage.getItem('judges') || '[]');
                
                scores = scores.filter(score => {
                    const assignment = assignments.find(a => a.id === score.assignment_id);
                    if (!assignment) return false;
                    
                    if (filters.work_id && assignment.work_id !== filters.work_id) return false;
                    if (filters.judge_id && assignment.judge_id !== filters.judge_id) return false;
                    
                    return true;
                });
            }
            
            return scores;
        }
    }

    // ============================================
    // Configs 操作
    // ============================================

    async getConfigs() {
        if (this.useSupabase && this.supabase) {
            const { data, error } = await this.supabase
                .from('configs')
                .select('*');
            
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

    async getConfig(key) {
        const configs = await this.getConfigs();
        return configs[key];
    }

    // ============================================
    // Helper Functions
    // ============================================

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 获取当前模式
     */
    getMode() {
        return this.useSupabase ? 'supabase' : 'localStorage';
    }

    /**
     * 切换模式（用于测试）
     */
    toggleMode() {
        this.useSupabase = !this.useSupabase;
        console.log(`🔄 已切换到${this.useSupabase ? 'Supabase' : 'localStorage'}模式`);
        return this.useSupabase;
    }

    // ============================================
    // Page Views 操作 (访问统计)
    // ============================================

    async recordPageView(pageName = 'unknown') {
        if (this.useSupabase && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('page_views')
                    .insert([{
                        page_name: pageName,
                        visited_at: new Date().toISOString(),
                        user_agent: navigator.userAgent,
                        referrer: document.referrer || null
                    }]);
                
                if (error) {
                    console.warn('⚠️ 记录访问失败:', error.message);
                } else {
                    console.log('✅ 访问已记录');
                }
            } catch (err) {
                console.error('❌ 记录访问错误:', err);
            }
        }
        // localStorage模式下不记录
    }

    async getPageViews(filters = {}) {
        if (this.useSupabase && this.supabase) {
            let query = this.supabase
                .from('page_views')
                .select('*');
            
            if (filters.page_name) {
                query = query.eq('page_name', filters.page_name);
            }
            if (filters.start_date) {
                query = query.gte('visited_at', filters.start_date);
            }
            if (filters.end_date) {
                query = query.lte('visited_at', filters.end_date);
            }
            
            query = query.order('visited_at', { ascending: false });
            
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        }
        return [];
    }

    async getPageViewStats() {
        if (this.useSupabase && this.supabase) {
            // 获取总访问量
            const { count: totalCount, error: countError } = await this.supabase
                .from('page_views')
                .select('*', { count: 'exact', head: true });
            
            if (countError) throw countError;
            
            // 获取各页面访问量（客户端聚合，避免依赖数据库 RPC 函数）
            const { data: rows, error: pageError } = await this.supabase
                .from('page_views')
                .select('page_name');
            
            if (pageError) throw pageError;
            
            const pageMap = {};
            (rows || []).forEach(r => {
                const key = r.page_name || 'unknown';
                pageMap[key] = (pageMap[key] || 0) + 1;
            });
            const pageStats = Object.entries(pageMap)
                .map(([page_name, count]) => ({ page_name, count }))
                .sort((a, b) => b.count - a.count);
            
            // 获取今日访问量
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString();
            
            const { count: todayCount, error: todayError } = await this.supabase
                .from('page_views')
                .select('*', { count: 'exact', head: true })
                .gte('visited_at', todayStr);
            
            if (todayError) throw todayError;
            
            return {
                total: totalCount || 0,
                today: todayCount || 0,
                byPage: pageStats || []
            };
        }
        return { total: 0, today: 0, byPage: [] };
    }
}

// 创建全局单例
const storage = new StorageAdapter();

// 导出供模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = storage;
}
