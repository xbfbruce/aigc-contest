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

    // ---- 评委账号本地缓存工具 ----
    // 说明：localStorage 只作为「离线/云端不可用」时的兜底缓存，
    //       真正的账号数据以 Supabase judges 表为准（跨设备共享）。

    _getLocalJudges() {
        try {
            const list = JSON.parse(localStorage.getItem('judges') || '[]');
            return Array.isArray(list) ? list.filter(j => j && j.account) : [];
        } catch (e) {
            console.error('解析本地评委缓存失败:', e);
            return [];
        }
    }

    _saveLocalJudges(list) {
        try {
            localStorage.setItem('judges', JSON.stringify(list));
        } catch (e) {
            console.warn('写入本地评委缓存失败:', e);
        }
    }

    _cacheJudgeToLocal(judge) {
        const list = this._getLocalJudges();
        const idx = list.findIndex(j => j.account === judge.account);
        const entry = {
            account: judge.account,
            name: judge.name,
            password: judge.password || (idx >= 0 ? list[idx].password : '')
        };
        if (idx >= 0) list[idx] = { ...list[idx], ...entry };
        else list.push(entry);
        this._saveLocalJudges(list);
    }

    _removeJudgeFromLocal(account) {
        this._saveLocalJudges(this._getLocalJudges().filter(j => j.account !== account));
    }

    /**
     * 创建评委账号（写入云端，并缓存到本机）
     * @returns {Promise<{account,name,id?,syncedToCloud:boolean,cloudError?:string}>}
     */
    async createJudge(account, password, name) {
        account = String(account || '').trim();
        name = String(name || '').trim();
        if (!account || !password) throw new Error('账号和密码不能为空');

        const result = { account, name, syncedToCloud: false };

        if (this.useSupabase && this.supabase) {
            try {
                const passwordHash = await this.hashPassword(password);
                const { data, error } = await this.supabase
                    .from('judges')
                    .insert([{ account, password_hash: passwordHash, name }])
                    .select()
                    .single();

                if (error) throw error;
                result.id = data.id;
                result.syncedToCloud = true;
            } catch (error) {
                // 账号重复 → 明确报错，不做本地兜底
                if (error.code === '23505' || /duplicate key|unique/i.test(error.message || '')) {
                    throw new Error('该账号已存在');
                }
                console.error('❌ 云端创建评委失败:', error);
                result.cloudError = this._friendlyCloudError(error);
            }
        }

        // 无论云端是否成功，都写入本机缓存，保证当前设备可继续使用
        this._cacheJudgeToLocal({ account, name, password });
        return result;
    }

    /**
     * 更新评委信息（目前用于重置密码 / 改名）
     */
    async updateJudge(account, fields = {}) {
        const result = { account, syncedToCloud: false };

        if (this.useSupabase && this.supabase) {
            const payload = {};
            if (fields.name) payload.name = fields.name;
            if (fields.password) payload.password_hash = await this.hashPassword(fields.password);

            if (Object.keys(payload).length > 0) {
                try {
                    const { error } = await this.supabase
                        .from('judges')
                        .update(payload)
                        .eq('account', account);
                    if (error) throw error;
                    result.syncedToCloud = true;
                } catch (error) {
                    console.error('❌ 云端更新评委失败:', error);
                    result.cloudError = this._friendlyCloudError(error);
                }
            } else {
                result.syncedToCloud = true; // 无需更新云端
            }
        }

        // 同步本机缓存
        const list = this._getLocalJudges();
        const target = list.find(j => j.account === account);
        if (target) {
            if (fields.name) target.name = fields.name;
            if (fields.password) target.password = fields.password;
            this._saveLocalJudges(list);
        } else if (fields.name || fields.password) {
            this._cacheJudgeToLocal({ account, name: fields.name || account, password: fields.password });
        }

        return result;
    }

    /**
     * 云端评委列表（原始数据，含 password_hash）
     */
    async listCloudJudges() {
        if (!(this.useSupabase && this.supabase)) return [];
        const { data, error } = await this.supabase
            .from('judges')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    /**
     * 评委列表：云端 + 本机缓存合并（按 account 去重）
     * 每项带 source: 'cloud' | 'local'，便于管理端提示「仅本机」
     */
    async listJudges() {
        let cloud = [];
        let cloudError = null;
        try {
            cloud = await this.listCloudJudges();
        } catch (error) {
            cloudError = this._friendlyCloudError(error);
            console.warn('⚠️ 读取云端评委失败，回退到本机缓存:', error);
        }

        const merged = new Map();
        cloud.forEach(j => {
            if (!j || !j.account) return;
            merged.set(j.account, {
                id: j.id,
                account: j.account,
                name: j.name,
                created_at: j.created_at,
                source: 'cloud'
            });
        });

        this._getLocalJudges().forEach(j => {
            if (merged.has(j.account)) {
                // 云端已有，本机缓存仅补充明文密码（用于本地兜底登录）
                merged.get(j.account).password = j.password;
                return;
            }
            merged.set(j.account, {
                id: j.id,
                account: j.account,
                name: j.name,
                password: j.password,
                created_at: j.created_at,
                source: 'local'
            });
        });

        const list = [...merged.values()];
        list.cloudError = cloudError;
        return list;
    }

    /**
     * 把本机缓存中「云端没有」的评委账号补传到云端
     * 用于修复历史上只存在于某台设备的账号
     */
    async syncLocalJudgesToCloud() {
        if (!(this.useSupabase && this.supabase)) {
            return { synced: 0, failed: 0, skipped: 0, cloudAvailable: false };
        }

        let cloud = [];
        try {
            cloud = await this.listCloudJudges();
        } catch (error) {
            return { synced: 0, failed: 0, skipped: 0, cloudAvailable: false, error: this._friendlyCloudError(error) };
        }

        const cloudAccounts = new Set(cloud.map(j => j.account));
        const locals = this._getLocalJudges().filter(j => !cloudAccounts.has(j.account));

        let synced = 0, failed = 0;
        const errors = [];
        for (const j of locals) {
            if (!j.password) { failed++; errors.push(`${j.account}：本机未保存密码，无法上传`); continue; }
            try {
                const passwordHash = await this.hashPassword(j.password);
                const { error } = await this.supabase
                    .from('judges')
                    .insert([{ account: j.account, password_hash: passwordHash, name: j.name || j.account }]);
                if (error) throw error;
                synced++;
            } catch (error) {
                failed++;
                errors.push(`${j.account}：${error.message || error}`);
            }
        }

        return { synced, failed, skipped: locals.length - synced - failed, cloudAvailable: true, errors };
    }

    async deleteJudge(id) {
        if (this.useSupabase && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('judges')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            } catch (error) {
                console.warn('⚠️ 云端删除评委(id)失败:', error);
            }
        }
        const list = this._getLocalJudges();
        this._saveLocalJudges(list.filter(j => j.id !== id));
    }

    /**
     * 按账号删除评委（管理端使用）
     */
    async deleteJudgeByAccount(account) {
        let syncedToCloud = false;
        if (this.useSupabase && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('judges')
                    .delete()
                    .eq('account', account);
                if (error) throw error;
                syncedToCloud = true;
            } catch (error) {
                console.error('❌ 云端删除评委失败:', error);
                return { syncedToCloud: false, cloudError: this._friendlyCloudError(error) };
            }
        }
        this._removeJudgeFromLocal(account);
        return { syncedToCloud };
    }

    /**
     * 清空云端 + 本机所有评委账号
     */
    async clearAllJudges() {
        let syncedToCloud = false;
        if (this.useSupabase && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('judges')
                    .delete()
                    .not('account', 'is', null);
                if (error) throw error;
                syncedToCloud = true;
            } catch (error) {
                console.error('❌ 云端清空评委失败:', error);
                return { syncedToCloud: false, cloudError: this._friendlyCloudError(error) };
            }
        }
        this._saveLocalJudges([]);
        return { syncedToCloud };
    }

    /**
     * 评委登录：云端优先，本机缓存兜底
     */
    async loginJudge(account, password) {
        const localList = this._getLocalJudges();

        if (this.useSupabase && this.supabase) {
            let cloudReachable = false;
            let cloudTotal = 0;
            try {
                const passwordHash = await this.hashPassword(password);
                const { data, error } = await this.supabase
                    .from('judges')
                    .select('*')
                    .eq('account', account)
                    .eq('password_hash', passwordHash)
                    .maybeSingle();

                if (error) throw error;
                cloudReachable = true;

                if (data) {
                    // 登录成功，顺便刷新本机缓存
                    this._cacheJudgeToLocal({ account: data.account, name: data.name, password });
                    return { account: data.account, name: data.name, password, id: data.id, source: 'cloud' };
                }

                const { count, error: countError } = await this.supabase
                    .from('judges')
                    .select('*', { count: 'exact', head: true });
                cloudTotal = countError ? -1 : (count || 0);
            } catch (error) {
                console.warn('⚠️ 云端评委校验不可用，尝试本机缓存:', error);
            }

            // 云端可达但账号不存在：
            //   • 云端已有评委数据 → 说明账号确实不存在/密码错误，不允许本地兜底
            //   • 云端一条都没有（例如策略未开通）→ 允许用本机缓存登录，避免完全无法使用
            if (cloudReachable && cloudTotal > 0) {
                throw new Error('账号或密码错误');
            }
        }

        const judge = localList.find(j => j.account === account && j.password === password);
        if (!judge) {
            throw new Error('账号或密码错误');
        }
        return { ...judge, source: 'local' };
    }

    /**
     * 把 Supabase 错误翻译成用户能看懂的中文提示
     */
    _friendlyCloudError(error) {
        if (!error) return '未知错误';
        const msg = error.message || String(error);
        if (error.code === 'PGRST205' || /Could not find the table/i.test(msg)) {
            return '云端数据表尚未创建：请在 Supabase SQL Editor 执行 migration_cloud_accounts_and_config.sql';
        }
        if (error.code === '42501' || /row-level security/i.test(msg)) {
            return '云端权限未开通：请在 Supabase SQL Editor 执行 migration_cloud_accounts_and_config.sql';
        }
        if (/Failed to fetch|Load failed|NetworkError|timeout/i.test(msg)) {
            return '网络异常，无法连接云端';
        }
        return msg;
    }

    // ============================================
    // 站点配置（投稿规格 / 管理员账号 / 评分项）
    // 云端 site_config 表为准，localStorage 作为缓存与离线兜底
    // ============================================

    get CONFIG_KEYS() {
        return ['submissionSpecs', 'adminConfig', 'scoringItems'];
    }

    _readLocalConfig(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn(`⚠️ 解析本地配置 ${key} 失败:`, e);
            return null;
        }
    }

    /**
     * 读取配置（同步，取自 refreshCloudConfig 刷新后的本机缓存）
     */
    getConfig(key) {
        return this._readLocalConfig(key);
    }

    _writeLocalConfig(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn(`⚠️ 写入本地配置 ${key} 失败:`, e);
        }
    }

    /**
     * 从云端拉取全部站点配置并刷新本机缓存
     * 页面启动时调用一次，之后的同步读取即可拿到最新配置
     */
    async refreshCloudConfig() {
        if (!(this.useSupabase && this.supabase)) {
            return { ok: false, reason: '当前为 localStorage 模式' };
        }

        try {
            const { data, error } = await this.supabase
                .from('site_config')
                .select('key, value, updated_at');

            if (error) throw error;

            const rows = data || [];
            this._cloudConfigKeys = new Set(rows.map(r => r.key));

            rows.forEach(row => {
                if (!row || !row.key || row.value === null || row.value === undefined) return;
                this._writeLocalConfig(row.key, row.value);
            });

            console.log(`✅ 已同步云端站点配置：${rows.map(r => r.key).join(', ') || '(空)'}`);
            return { ok: true, updated: rows.length, cloudKeys: [...this._cloudConfigKeys] };
        } catch (error) {
            const reason = this._friendlyCloudError(error);
            console.warn('⚠️ 读取云端站点配置失败，使用本机缓存:', reason);
            return { ok: false, reason };
        }
    }

    /**
     * 保存配置：云端 upsert + 本机缓存
     * adminConfig 上传云端时只保存密码哈希，不保存明文
     */
    async saveConfig(key, value) {
        // 本机缓存始终保留完整值（含明文密码），保证离线可用
        this._writeLocalConfig(key, value);

        if (!(this.useSupabase && this.supabase)) {
            return { syncedToCloud: false, cloudError: '当前为 localStorage 模式，配置只保存在本设备' };
        }

        try {
            const payload = key === 'adminConfig' ? await this._hashAdminConfig(value) : value;
            const { error } = await this.supabase
                .from('site_config')
                .upsert([{ key, value: payload, updated_at: new Date().toISOString() }]);

            if (error) throw error;
            if (this._cloudConfigKeys) this._cloudConfigKeys.add(key);
            return { syncedToCloud: true };
        } catch (error) {
            const cloudError = this._friendlyCloudError(error);
            console.error(`❌ 云端保存配置 ${key} 失败:`, error);
            return { syncedToCloud: false, cloudError };
        }
    }

    async _hashAdminConfig(cfg) {
        const out = { account: (cfg && cfg.account) || 'admin' };
        if (cfg && cfg.password) {
            out.passwordHash = await this.hashPassword(cfg.password);
        } else if (cfg && cfg.passwordHash) {
            out.passwordHash = cfg.passwordHash;
        }
        return out;
    }

    /**
     * 删除配置（恢复默认时使用）：云端行 + 本机缓存一并清除
     */
    async deleteConfig(key) {
        localStorage.removeItem(key);
        if (!(this.useSupabase && this.supabase)) {
            return { syncedToCloud: false, cloudError: '当前为 localStorage 模式' };
        }
        try {
            const { error } = await this.supabase
                .from('site_config')
                .delete()
                .eq('key', key);
            if (error) throw error;
            if (this._cloudConfigKeys) this._cloudConfigKeys.delete(key);
            return { syncedToCloud: true };
        } catch (error) {
            return { syncedToCloud: false, cloudError: this._friendlyCloudError(error) };
        }
    }

    /**
     * 把本机已有、但云端还缺失的配置补传到云端
     * 用于第一次启用云端配置时的历史数据迁移
     */
    async syncLocalConfigToCloud() {
        if (!(this.useSupabase && this.supabase)) {
            return { cloudAvailable: false, synced: 0, skipped: 0 };
        }

        let cloudKeys = new Set();
        try {
            const { data, error } = await this.supabase.from('site_config').select('key');
            if (error) throw error;
            cloudKeys = new Set((data || []).map(r => r.key));
            this._cloudConfigKeys = cloudKeys;
        } catch (error) {
            return { cloudAvailable: false, synced: 0, skipped: 0, error: this._friendlyCloudError(error) };
        }

        let synced = 0;
        const errors = [];
        for (const key of this.CONFIG_KEYS) {
            if (cloudKeys.has(key)) continue;
            const local = this._readLocalConfig(key);
            if (!local) continue;
            const result = await this.saveConfig(key, local);
            if (result.syncedToCloud) synced++;
            else errors.push(`${key}：${result.cloudError}`);
        }

        return { cloudAvailable: true, synced, errors };
    }

    /**
     * 管理员登录校验：同时兼容明文密码（旧本机数据）与密码哈希（云端数据）
     * @returns {Promise<{account:string, source:string}|null>}
     */
    async loginAdmin(account, password) {
        const hash = await this.hashPassword(password);
        const candidates = [];

        const cfg = this._readLocalConfig('adminConfig');
        if (cfg) candidates.push({ cfg, source: cfg.passwordHash ? 'cloud' : 'local' });
        // 全新环境（无任何配置）时保留出厂默认，避免管理端被锁死
        candidates.push({ cfg: { account: 'admin', password: 'admin123' }, source: 'default' });

        for (const item of candidates) {
            if (!item.cfg || item.cfg.account !== account) continue;
            if (item.cfg.password && item.cfg.password === password) return { account, source: item.source };
            if (item.cfg.passwordHash && item.cfg.passwordHash === hash) return { account, source: item.source };
        }
        return null;
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
