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
        // 云端不可用的原因（SDK 未加载 / 初始化失败），用于给用户准确提示
        this.cloudUnavailableReason = null;
        
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
                this.cloudUnavailableReason = 'Supabase SDK 未加载，多为当前网络无法访问外部 CDN';
                return;
            }
            
            // 创建Supabase客户端
            this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            this.supabaseUrl = SUPABASE_URL;
            this.supabaseAnonKey = SUPABASE_ANON_KEY;
            this.useSupabase = true;
            this.cloudUnavailableReason = null;
            console.log('✅ Supabase已成功初始化');
            console.log('📊 当前模式:', this.useSupabase ? '云端模式 (Supabase)' : '本地模式 (localStorage)');
            
        } catch (error) {
            console.error('❌ Supabase初始化失败:', error);
            console.warn('⚠️ 降级到localStorage模式');
            this.useSupabase = false;
            this.cloudUnavailableReason = 'Supabase 客户端初始化失败：' + (error && error.message ? error.message : error);
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
        if (judge) {
            return { ...judge, source: 'local' };
        }

        // 云端不可用（SDK 没加载 / 网络不通）且本机也没有这个账号时，
        // 报「账号或密码错误」会误导用户反复改密码，这里给出真实原因
        if (!this.useSupabase && this.cloudUnavailableReason) {
            throw new Error(`无法连接云端数据库（${this.cloudUnavailableReason}）。请检查网络后重新打开页面；若仍失败请清除浏览器缓存后重试`);
        }

        throw new Error('账号或密码错误');
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
    // 云端 configs 表为准，localStorage 只作缓存与离线兜底
    // ============================================

    /** 本机 localStorage 键 ↔ 云端 configs.key */
    get CONFIG_KEY_MAP() {
        return {
            submissionSpecs: 'submission_specs',
            adminConfig: 'admin_config',
            scoringItems: 'scoring_items'
        };
    }

    /**
     * 云端配置的结构版本号。
     * configs 表里存在 2026-10-20 初始化写入的种子行（字段结构与现在不同，
     * 例如 image.minSizeMB=5），版本号不匹配的行一律视为历史数据，
     * 绝不用它覆盖本机正在使用的配置。
     */
    get CONFIG_SCHEMA() {
        return 2;
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

    _writeLocalConfig(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn(`⚠️ 写入本地配置 ${key} 失败:`, e);
        }
    }

    /**
     * 同步读取配置缓存（页面启动时先 await refreshCloudConfig，之后即可同步取用）
     */
    getCachedConfig(key) {
        return this._readLocalConfig(key);
    }

    /**
     * 云端配置状态：cloud（可信）/ legacy（历史种子数据）/ missing（云端没有）/ unknown（还没查过或查不到）
     */
    getCloudConfigState(key) {
        return (this._cloudConfigState || {})[key] || 'unknown';
    }

    /**
     * 投稿规格的出厂默认值。
     * 任何设备在云端还没有配置时，选手端也要能看到完整的参赛要求，
     * 因此这里给出一份与当前赛事标准一致的兜底值（图片 ≥0.1MB）。
     */
    get DEFAULT_SUBMISSION_SPECS() {
        return {
            video: {
                enabled: true,
                formats: ['MP4'],
                minWidth: 1920,
                minHeight: 1080,
                maxDuration: 180,
                maxSize: 100,
                subtitleRequired: true
            },
            image: {
                enabled: true,
                formats: ['JPG', 'PNG', 'JPEG'],
                minDPI: 300,
                minWidth: 2400,
                minHeight: 1800,
                minSize: 0.1,
                maxFiles: 5
            },
            deadline: '2026-12-31 23:59',
            maxSubmissionsPerCategory: 1,
            descriptionMinLength: 50
        };
    }

    /**
     * 读取投稿规格：云端/本机配置与出厂默认值合并，
     * 保证任何设备上都不会出现「要求空白」的情况
     */
    getSubmissionSpecs() {
        const cached = this.getCachedConfig('submissionSpecs') || {};
        const defaults = this.DEFAULT_SUBMISSION_SPECS;

        return {
            ...defaults,
            ...cached,
            video: { ...defaults.video, ...(cached.video || {}) },
            image: { ...defaults.image, ...(cached.image || {}) }
        };
    }

    // ============================================
    // 参赛组别（全站唯一来源，选手端/评委端/管理端共用）
    // ============================================

    /**
     * 8 个参赛组别，与选手名单 contestants.json 完全一致。
     * 任何页面的组别下拉框都应由此生成，不要再各写一份，
     * 否则一旦名称有出入（例如「视频高中组」vs「视频高中组（含中专、职高）」），
     * 评委端按名称精确匹配就会一个作品都筛不出来。
     */
    get CONTEST_GROUPS() {
        return [
            { value: '视频类小学低年级组', label: '视频类小学低年级组', type: 'video' },
            { value: '视频类小学高年级组', label: '视频类小学高年级组', type: 'video' },
            { value: '视频类初中组', label: '视频类初中组', type: 'video' },
            { value: '视频高中组（含中专、职高）', label: '视频高中组（含中专、职高）', type: 'video' },
            { value: '漫画类小学低年级组', label: '漫画类小学低年级组', type: 'image' },
            { value: '漫画类小学高年级组', label: '漫画类小学高年级组', type: 'image' },
            { value: '漫画类初中组', label: '漫画类初中组', type: 'image' },
            { value: '漫画类高中组（含中专、职高）', label: '漫画类高中组（含中专、职高）', type: 'image' }
        ];
    }

    /**
     * 组别名称归一化：历史数据里括号有全角/半角混用（「（含中专、职高)」），
     * 也存在省略后缀的简写（「视频高中组」）。统一成同一种写法后再比较，
     * 这样云端已存在的作品不需要迁移就能被正确筛选出来。
     */
    normalizeGroupName(name) {
        if (!name) return '';
        let n = String(name).trim().replace(/\s+/g, '');
        // 括号统一为全角
        n = n.replace(/\(/g, '（').replace(/\)/g, '）');
        // 简写 → 全称
        const aliases = {
            '视频高中组': '视频高中组（含中专、职高）',
            '漫画类高中组': '漫画类高中组（含中专、职高）',
            '视频类高中组': '视频高中组（含中专、职高）',
            '漫画高中组': '漫画类高中组（含中专、职高）'
        };
        return aliases[n] || n;
    }

    /**
     * 用于界面展示的组别名：优先取标准写法，未知组别原样返回（归一化括号后）
     */
    displayGroupName(name) {
        const normalized = this.normalizeGroupName(name);
        if (!normalized) return '未分配';
        const hit = this.CONTEST_GROUPS.find(g => this.normalizeGroupName(g.value) === normalized);
        return hit ? hit.label : normalized;
    }

    /**
     * 判断作品的组别是否命中筛选条件
     */
    isSameGroup(workGroup, filterGroup) {
        if (!filterGroup) return true;
        return this.normalizeGroupName(workGroup) === this.normalizeGroupName(filterGroup);
    }

    /**
     * 用标准组别填充下拉框（视频类 / 漫画类 分组展示）
     * @param {HTMLSelectElement|string} select 目标 select 元素或其 id
     * @param {string} selectedValue 需要保持选中的值
     */
    populateGroupSelect(select, selectedValue = '') {
        const el = typeof select === 'string' ? document.getElementById(select) : select;
        if (!el) return;

        const wanted = this.normalizeGroupName(selectedValue || el.value || '');
        const build = (type) => this.CONTEST_GROUPS
            .filter(g => g.type === type)
            .map(g => `<option value="${g.value}">${g.label}</option>`)
            .join('');

        el.innerHTML = '<option value="">全部组别</option>'
            + `<optgroup label="视频类">${build('video')}</optgroup>`
            + `<optgroup label="漫画类">${build('image')}</optgroup>`;

        // 归一化后匹配，兼容旧页面里遗留的简写值
        const options = Array.from(el.options);
        const match = options.find(o => o.value && this.normalizeGroupName(o.value) === wanted);
        el.value = match ? match.value : '';
    }

    /**
     * 从云端拉取配置并刷新本机缓存
     */
    async refreshCloudConfig() {
        if (!(this.useSupabase && this.supabase)) {
            return { ok: false, reason: '当前为 localStorage 模式' };
        }

        try {
            const { data, error } = await this.supabase
                .from('configs')
                .select('key, value, updated_at');

            if (error) throw error;

            const byCloudKey = {};
            (data || []).forEach(row => {
                if (row && row.key) byCloudKey[row.key] = row;
            });

            const state = {};
            const map = this.CONFIG_KEY_MAP;

            Object.keys(map).forEach(localKey => {
                const row = byCloudKey[map[localKey]];
                if (!row) {
                    state[localKey] = 'missing';
                    return;
                }

                const value = row.value;
                if (!value || typeof value !== 'object' || value._schema !== this.CONFIG_SCHEMA) {
                    // 历史初始化数据，不用它覆盖本机正在使用的配置
                    state[localKey] = 'legacy';
                    console.warn(`ℹ️ 云端 ${map[localKey]} 是历史初始化数据，已忽略（以本机配置为准）`);
                    return;
                }

                const clean = { ...value };
                delete clean._schema;
                this._writeLocalConfig(localKey, clean);
                state[localKey] = 'cloud';
            });

            this._cloudConfigState = state;
            console.log('✅ 云端配置状态:', state);
            return { ok: true, state };
        } catch (error) {
            const reason = this._friendlyCloudError(error);
            console.warn('⚠️ 读取云端配置失败，使用本机缓存:', reason);
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

        const cloudKey = this.CONFIG_KEY_MAP[key];
        if (!cloudKey) {
            return { syncedToCloud: false, cloudError: `未知配置项：${key}` };
        }

        if (!(this.useSupabase && this.supabase)) {
            return { syncedToCloud: false, cloudError: '当前为 localStorage 模式，配置只保存在本设备' };
        }

        try {
            const base = key === 'adminConfig' ? await this._hashAdminConfig(value) : value;
            const payload = { ...base, _schema: this.CONFIG_SCHEMA };

            const { error } = await this.supabase
                .from('configs')
                .upsert([{ key: cloudKey, value: payload, updated_at: new Date().toISOString() }]);

            if (error) throw error;
            if (this._cloudConfigState) this._cloudConfigState[key] = 'cloud';
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

        const cloudKey = this.CONFIG_KEY_MAP[key];
        if (!cloudKey) return { syncedToCloud: false, cloudError: `未知配置项：${key}` };
        if (!(this.useSupabase && this.supabase)) {
            return { syncedToCloud: false, cloudError: '当前为 localStorage 模式' };
        }

        try {
            const { error } = await this.supabase
                .from('configs')
                .delete()
                .eq('key', cloudKey);
            if (error) throw error;
            if (this._cloudConfigState) this._cloudConfigState[key] = 'missing';
            return { syncedToCloud: true };
        } catch (error) {
            return { syncedToCloud: false, cloudError: this._friendlyCloudError(error) };
        }
    }

    /**
     * 把本机配置补传到云端
     * @param {string[]|null} keys 需要同步的配置键，默认检查全部
     * @param {boolean} includeLegacy 是否覆盖云端的历史种子数据
     *        （投稿规格影响全站校验规则，必须由管理员确认后手动上传）
     */
    async syncLocalConfigToCloud(keys = null, includeLegacy = false) {
        if (!(this.useSupabase && this.supabase)) {
            return { cloudAvailable: false, synced: 0, skipped: [], errors: [] };
        }

        const refresh = await this.refreshCloudConfig();
        if (!refresh.ok) {
            return { cloudAvailable: false, synced: 0, skipped: [], errors: [refresh.reason] };
        }

        const targets = keys || Object.keys(this.CONFIG_KEY_MAP);
        let synced = 0;
        const skipped = [];
        const errors = [];

        for (const key of targets) {
            const state = this.getCloudConfigState(key);
            if (state === 'cloud') { skipped.push(key); continue; }
            if (state === 'legacy' && !includeLegacy) { skipped.push(key); continue; }

            const local = this._readLocalConfig(key);
            if (!local) { skipped.push(key); continue; }

            const result = await this.saveConfig(key, local);
            if (result.syncedToCloud) synced++;
            else errors.push(`${key}：${result.cloudError}`);
        }

        return { cloudAvailable: true, synced, skipped, errors };
    }

    /**
     * 管理员登录校验：兼容明文密码（旧本机数据）与密码哈希（云端数据）
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
    // Helper Functions
    // ============================================

    async hashPassword(password) {
        const bytes = new TextEncoder().encode(password);

        // 优先用浏览器原生 WebCrypto
        if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
            try {
                const buf = await crypto.subtle.digest('SHA-256', bytes);
                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                console.warn('⚠️ WebCrypto 不可用，改用内置 SHA-256:', e);
            }
        }

        // 老旧平板 / 非安全上下文没有 crypto.subtle，
        // 若直接抛错会让评委登录莫名报「账号或密码错误」，这里用纯 JS 实现兜底
        return this._sha256Hex(bytes);
    }

    /**
     * 纯 JS 版 SHA-256（FIPS 180-4），仅作为 WebCrypto 缺失时的兜底，
     * 输出与 crypto.subtle.digest('SHA-256') 完全一致
     */
    _sha256Hex(bytes) {
        const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

        const len = bytes.length;
        const total = Math.ceil((len + 9) / 64) * 64;
        const msg = new Uint8Array(total);
        msg.set(bytes);
        msg[len] = 0x80;

        const dv = new DataView(msg.buffer);
        const bitLen = len * 8;
        dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
        dv.setUint32(total - 4, bitLen >>> 0);

        const w = new Uint32Array(64);
        for (let i = 0; i < total; i += 64) {
            for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
            for (let t = 16; t < 64; t++) {
                const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
                const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
            }

            let a = H[0], b = H[1], c = H[2], d = H[3];
            let e = H[4], f = H[5], g = H[6], h = H[7];

            for (let t = 0; t < 64; t++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (S0 + maj) >>> 0;
                h = g; g = f; f = e;
                e = (d + t1) >>> 0;
                d = c; c = b; b = a;
                a = (t1 + t2) >>> 0;
            }

            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
            H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
            H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }

        return H.map(x => x.toString(16).padStart(8, '0')).join('');
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
