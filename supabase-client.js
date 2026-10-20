/**
 * Supabase Client Configuration
 * 
 * 使用前请替换为你的Supabase项目凭证
 */

import { createClient } from '@supabase/supabase-js';

// ⚠️ 重要：将以下值替换为你的Supabase项目实际值
const SUPABASE_URL = 'https://pqchakbrsatzxepypkyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2hha2Jyc2F0enhlcHlwa3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTg5MTQsImV4cCI6MjEwODAzNDkxNH0.Zn38gYyaRGfiGnk9AVeCFxBa0VmqXIXuJq_3MTHGOhU';

// 创建Supabase客户端
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// Helper Functions
// ============================================

/**
 * Generate UUID
 */
export function generateUUID() {
    return crypto.randomUUID();
}

/**
 * Get current timestamp in ISO format
 */
export function now() {
    return new Date().toISOString();
}

/**
 * Simple password hashing (for demo only!)
 * In production, use bcrypt or server-side hashing
 */
export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// API Functions - Contestants
// ============================================

/**
 * Register a new contestant
 */
export async function registerContestant(name, school) {
    const { data, error } = await supabase
        .from('contestants')
        .insert([{ name, school }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get contestant by ID
 */
export async function getContestant(id) {
    const { data, error } = await supabase
        .from('contestants')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

// ============================================
// API Functions - Works
// ============================================

/**
 * Submit a new work
 */
export async function submitWork(workData) {
    const { data, error } = await supabase
        .from('works')
        .insert([workData])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * List works with optional filters
 */
export async function listWorks(filters = {}) {
    let query = supabase
        .from('works')
        .select(`
            *,
            contestants (
                name,
                school
            )
        `);

    if (filters.category) {
        query = query.eq('category', filters.category);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    if (filters.contestant_id) {
        query = query.eq('contestant_id', filters.contestant_id);
    }

    query = query.order('submit_time', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Get work by ID
 */
export async function getWork(id) {
    const { data, error } = await supabase
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
}

/**
 * Delete a work
 */
export async function deleteWork(id) {
    const { error } = await supabase
        .from('works')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadFile(file, bucket = 'works') {
    const fileExt = file.name.split('.').pop();
    const fileName = `${generateUUID()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return {
        path: filePath,
        url: publicUrl,
        name: file.name,
        size: file.size
    };
}

// ============================================
// API Functions - Judges
// ============================================

/**
 * Create a new judge account
 */
export async function createJudge(account, password, name) {
    const passwordHash = await hashPassword(password);
    
    const { data, error } = await supabase
        .from('judges')
        .insert([{ account, password_hash: passwordHash, name }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * List all judges
 */
export async function listJudges() {
    const { data, error } = await supabase
        .from('judges')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Delete a judge
 */
export async function deleteJudge(id) {
    const { error } = await supabase
        .from('judges')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

/**
 * Login judge
 */
export async function loginJudge(account, password) {
    const passwordHash = await hashPassword(password);
    
    const { data, error } = await supabase
        .from('judges')
        .select('*')
        .eq('account', account)
        .eq('password_hash', passwordHash)
        .single();

    if (error || !data) {
        throw new Error('Invalid credentials');
    }

    return data;
}

// ============================================
// API Functions - Assignments
// ============================================

/**
 * Assign works to a judge
 */
export async function createAssignments(judgeId, workIds) {
    const assignments = workIds.map(workId => ({
        judge_id: judgeId,
        work_id: workId
    }));

    const { data, error } = await supabase
        .from('assignments')
        .insert(assignments)
        .select();

    if (error) throw error;
    return data;
}

/**
 * List assignments with filters
 */
export async function listAssignments(filters = {}) {
    let query = supabase
        .from('assignments')
        .select(`
            *,
            judges (
                name
            ),
            works (
                title,
                category
            )
        `);

    if (filters.judge_id) {
        query = query.eq('judge_id', filters.judge_id);
    }
    if (filters.work_id) {
        query = query.eq('work_id', filters.work_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Delete an assignment
 */
export async function deleteAssignment(judgeId, workId) {
    const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('judge_id', judgeId)
        .eq('work_id', workId);

    if (error) throw error;
}

// ============================================
// API Functions - Scores
// ============================================

/**
 * Submit or update a score
 */
export async function submitScore(scoreData) {
    // Check if score already exists for this assignment
    const { data: existing } = await supabase
        .from('scores')
        .select('id')
        .eq('assignment_id', scoreData.assignment_id)
        .single();

    let result;
    
    if (existing) {
        // Update existing score
        const { data, error } = await supabase
            .from('scores')
            .update({
                creativity_score: scoreData.creativity_score,
                technical_score: scoreData.technical_score,
                visual_score: scoreData.visual_score,
                theme_score: scoreData.theme_score,
                comment: scoreData.comment,
                updated_at: now()
            })
            .eq('assignment_id', scoreData.assignment_id)
            .select()
            .single();

        if (error) throw error;
        result = data;
    } else {
        // Insert new score
        const { data, error } = await supabase
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
}

/**
 * List scores with filters
 */
export async function listScores(filters = {}) {
    let query = supabase
        .from('scores')
        .select(`
            *,
            assignments (
                judges (name),
                works (title)
            )
        `);

    if (filters.work_id) {
        query = query.eq('assignments.work_id', filters.work_id);
    }
    if (filters.judge_id) {
        query = query.eq('assignments.judge_id', filters.judge_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Get score by assignment
 */
export async function getScoreByAssignment(assignmentId) {
    const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('assignment_id', assignmentId)
        .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
}

// ============================================
// API Functions - Configs
// ============================================

/**
 * Get all configs
 */
export async function getConfigs() {
    const { data, error } = await supabase
        .from('configs')
        .select('*');

    if (error) throw error;
    
    // Convert array to object
    const configs = {};
    (data || []).forEach(row => {
        configs[row.key] = row.value;
    });
    
    return configs;
}

/**
 * Update a config value
 */
export async function updateConfig(key, value) {
    const { data, error } = await supabase
        .from('configs')
        .upsert({ key, value, updated_at: now() })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get a specific config
 */
export async function getConfig(key) {
    const { data, error } = await supabase
        .from('configs')
        .select('value')
        .eq('key', key)
        .single();

    if (error) throw error;
    return data?.value;
}
