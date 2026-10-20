/**
 * AIGC Contest System - Backend API
 * 
 * RESTful API for contestant submission, judge scoring, and admin management
 */

interface Env {
  DB: Database;
  STORAGE: Storage;
}

// Helper: Generate UUID
function generateUUID(): string {
  return crypto.randomUUID();
}

// Helper: Get current timestamp
function now(): string {
  return new Date().toISOString();
}

// Helper: Simple password hashing (for demo; use bcrypt in production)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Parse JSON body
async function parseJSON(request: Request): Promise<any> {
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON');
  }
}

// Helper: Create JSON response
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// Helper: Error response
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Routes handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ===== Authentication Routes =====
      
      // POST /api/auth/login - Login for all roles
      if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, env);
      }

      // POST /api/auth/register - Register contestant
      if (path === '/api/auth/register' && method === 'POST') {
        return await handleRegisterContestant(request, env);
      }

      // ===== Works Routes =====
      
      // POST /api/works - Submit a new work
      if (path === '/api/works' && method === 'POST') {
        return await handleSubmitWork(request, env);
      }

      // GET /api/works - List works (with filters)
      if (path === '/api/works' && method === 'GET') {
        return await handleListWorks(request, env);
      }

      // GET /api/works/:id - Get work details
      if (path.match(/^\/api\/works\/[^\/]+$/) && method === 'GET') {
        const workId = path.split('/').pop()!;
        return await handleGetWork(workId, env);
      }

      // DELETE /api/works/:id - Delete a work
      if (path.match(/^\/api\/works\/[^\/]+$/) && method === 'DELETE') {
        const workId = path.split('/').pop()!;
        return await handleDeleteWork(workId, env);
      }

      // ===== Assignments Routes =====
      
      // POST /api/assignments - Assign works to judges
      if (path === '/api/assignments' && method === 'POST') {
        return await handleCreateAssignments(request, env);
      }

      // GET /api/assignments - List assignments (by judge or work)
      if (path === '/api/assignments' && method === 'GET') {
        return await handleListAssignments(request, env);
      }

      // DELETE /api/assignments - Remove assignment
      if (path === '/api/assignments' && method === 'DELETE') {
        return await handleDeleteAssignment(request, env);
      }

      // ===== Scores Routes =====
      
      // POST /api/scores - Submit or update score
      if (path === '/api/scores' && method === 'POST') {
        return await handleSubmitScore(request, env);
      }

      // GET /api/scores - List scores (with filters)
      if (path === '/api/scores' && method === 'GET') {
        return await handleListScores(request, env);
      }

      // ===== Judges Routes =====
      
      // POST /api/judges - Create judge account
      if (path === '/api/judges' && method === 'POST') {
        return await handleCreateJudge(request, env);
      }

      // GET /api/judges - List judges
      if (path === '/api/judges' && method === 'GET') {
        return await handleListJudges(env);
      }

      // DELETE /api/judges/:id - Delete judge
      if (path.match(/^\/api\/judges\/[^\/]+$/) && method === 'DELETE') {
        const judgeId = path.split('/').pop()!;
        return await handleDeleteJudge(judgeId, env);
      }

      // ===== Configs Routes =====
      
      // GET /api/configs - Get all configs
      if (path === '/api/configs' && method === 'GET') {
        return await handleGetConfigs(env);
      }

      // PUT /api/configs/:key - Update config
      if (path.match(/^\/api\/configs\/[^\/]+$/) && method === 'PUT') {
        const key = path.split('/').pop()!;
        return await handleUpdateConfig(key, request, env);
      }

      // Default: Not found
      return errorResponse('Route not found', 404);
    } catch (error) {
      console.error('API Error:', error);
      return errorResponse(error instanceof Error ? error.message : 'Internal server error', 500);
    }
  },
};

// ===== Implementation Functions =====

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { account, password, role } = body;

  if (!account || !password || !role) {
    return errorResponse('Missing required fields: account, password, role');
  }

  // Admin login (hardcoded for now)
  if (role === 'admin') {
    if (account === 'admin' && password === 'admin123') {
      return jsonResponse({
        success: true,
        user: { id: 'admin', name: '管理员', role: 'admin' },
      });
    }
    return errorResponse('Invalid admin credentials', 401);
  }

  // Judge login
  if (role === 'judge') {
    const result = await env.DB.prepare(
      'SELECT id, account, name FROM app.judges WHERE account = ? AND password_hash = ?'
    ).bind(account, await hashPassword(password)).first();

    if (result) {
      return jsonResponse({
        success: true,
        user: { id: result.id, name: result.name, role: 'judge' },
      });
    }
    return errorResponse('Invalid judge credentials', 401);
  }

  return errorResponse('Invalid role', 400);
}

async function handleRegisterContestant(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { name, school } = body;

  if (!name || !school) {
    return errorResponse('Missing required fields: name, school');
  }

  const id = generateUUID();
  await env.DB.prepare(
    'INSERT INTO app.contestants (id, name, school, created_at) VALUES (?, ?, ?, ?)'
  ).bind(id, name, school, now()).run();

  return jsonResponse({ success: true, contestant: { id, name, school } }, 201);
}

async function handleSubmitWork(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { contestant_id, category, title, description, file_name, file_size, file_url, thumbnail_url } = body;

  if (!contestant_id || !category || !title || !file_name || !file_size || !file_url) {
    return errorResponse('Missing required fields');
  }

  const id = generateUUID();
  await env.DB.prepare(
    'INSERT INTO app.works (id, contestant_id, category, title, description, file_name, file_size, file_url, thumbnail_url, status, submit_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, contestant_id, category, title, description || null, file_name, file_size, file_url, thumbnail_url || null, 'pending', now()).run();

  return jsonResponse({ success: true, work: { id, contestant_id, category, title, status: 'pending' } }, 201);
}

async function handleListWorks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const contestant_id = url.searchParams.get('contestant_id');

  let query = 'SELECT w.*, c.name as contestant_name, c.school FROM app.works w LEFT JOIN app.contestants c ON w.contestant_id = c.id';
  const conditions: string[] = [];
  const bindings: any[] = [];

  if (category) {
    conditions.push('w.category = ?');
    bindings.push(category);
  }
  if (status) {
    conditions.push('w.status = ?');
    bindings.push(status);
  }
  if (contestant_id) {
    conditions.push('w.contestant_id = ?');
    bindings.push(contestant_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY w.submit_time DESC';

  const result = await env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse({ works: result.results || [] });
}

async function handleGetWork(workId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT w.*, c.name as contestant_name, c.school FROM app.works w LEFT JOIN app.contestants c ON w.contestant_id = c.id WHERE w.id = ?'
  ).bind(workId).first();

  if (!result) {
    return errorResponse('Work not found', 404);
  }

  return jsonResponse({ work: result });
}

async function handleDeleteWork(workId: string, env: Env): Promise<Response> {
  // Delete related scores and assignments first
  await env.DB.prepare('DELETE FROM app.scores WHERE assignment_id IN (SELECT id FROM app.assignments WHERE work_id = ?)').bind(workId).run();
  await env.DB.prepare('DELETE FROM app.assignments WHERE work_id = ?').bind(workId).run();
  await env.DB.prepare('DELETE FROM app.works WHERE id = ?').bind(workId).run();

  return jsonResponse({ success: true });
}

async function handleCreateAssignments(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { judge_id, work_ids } = body;

  if (!judge_id || !work_ids || !Array.isArray(work_ids)) {
    return errorResponse('Missing required fields: judge_id, work_ids (array)');
  }

  const assignments = [];
  for (const workId of work_ids) {
    const id = generateUUID();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO app.assignments (id, judge_id, work_id, assigned_at) VALUES (?, ?, ?, ?)'
    ).bind(id, judge_id, workId, now()).run();
    assignments.push({ id, judge_id, work_id: workId });
  }

  return jsonResponse({ success: true, assignments }, 201);
}

async function handleListAssignments(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const judge_id = url.searchParams.get('judge_id');
  const work_id = url.searchParams.get('work_id');

  let query = 'SELECT a.*, j.name as judge_name, w.title as work_title, w.category FROM app.assignments a LEFT JOIN app.judges j ON a.judge_id = j.id LEFT JOIN app.works w ON a.work_id = w.id';
  const conditions: string[] = [];
  const bindings: any[] = [];

  if (judge_id) {
    conditions.push('a.judge_id = ?');
    bindings.push(judge_id);
  }
  if (work_id) {
    conditions.push('a.work_id = ?');
    bindings.push(work_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const result = await env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse({ assignments: result.results || [] });
}

async function handleDeleteAssignment(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { judge_id, work_id } = body;

  if (!judge_id || !work_id) {
    return errorResponse('Missing required fields: judge_id, work_id');
  }

  await env.DB.prepare('DELETE FROM app.scores WHERE assignment_id IN (SELECT id FROM app.assignments WHERE judge_id = ? AND work_id = ?)').bind(judge_id, work_id).run();
  await env.DB.prepare('DELETE FROM app.assignments WHERE judge_id = ? AND work_id = ?').bind(judge_id, work_id).run();

  return jsonResponse({ success: true });
}

async function handleSubmitScore(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { assignment_id, creativity_score, technical_score, visual_score, theme_score, comment } = body;

  if (!assignment_id || creativity_score == null || technical_score == null || visual_score == null || theme_score == null) {
    return errorResponse('Missing required fields');
  }

  const total_score = creativity_score + technical_score + visual_score + theme_score;
  const id = generateUUID();

  // Check if score already exists
  const existing = await env.DB.prepare('SELECT id FROM app.scores WHERE assignment_id = ?').bind(assignment_id).first();

  if (existing) {
    await env.DB.prepare(
      'UPDATE app.scores SET creativity_score = ?, technical_score = ?, visual_score = ?, theme_score = ?, total_score = ?, comment = ?, updated_at = ? WHERE assignment_id = ?'
    ).bind(creativity_score, technical_score, visual_score, theme_score, total_score, comment || null, now(), assignment_id).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO app.scores (id, assignment_id, creativity_score, technical_score, visual_score, theme_score, total_score, comment, scored_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, assignment_id, creativity_score, technical_score, visual_score, theme_score, total_score, comment || null, now(), now()).run();
  }

  return jsonResponse({ success: true, score: { assignment_id, total_score } });
}

async function handleListScores(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const work_id = url.searchParams.get('work_id');
  const judge_id = url.searchParams.get('judge_id');

  let query = 'SELECT s.*, j.name as judge_name, w.title as work_title FROM app.scores s LEFT JOIN app.assignments a ON s.assignment_id = a.id LEFT JOIN app.judges j ON a.judge_id = j.id LEFT JOIN app.works w ON a.work_id = w.id';
  const conditions: string[] = [];
  const bindings: any[] = [];

  if (work_id) {
    conditions.push('a.work_id = ?');
    bindings.push(work_id);
  }
  if (judge_id) {
    conditions.push('a.judge_id = ?');
    bindings.push(judge_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const result = await env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse({ scores: result.results || [] });
}

async function handleCreateJudge(request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const { account, password, name } = body;

  if (!account || !password || !name) {
    return errorResponse('Missing required fields: account, password, name');
  }

  const id = generateUUID();
  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      'INSERT INTO app.judges (id, account, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, account, passwordHash, name, now()).run();

    return jsonResponse({ success: true, judge: { id, account, name } }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return errorResponse('Account already exists', 409);
    }
    throw error;
  }
}

async function handleListJudges(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT id, account, name, created_at FROM app.judges ORDER BY created_at DESC').all();
  return jsonResponse({ judges: result.results || [] });
}

async function handleDeleteJudge(judgeId: string, env: Env): Promise<Response> {
  // Delete related scores and assignments first
  await env.DB.prepare('DELETE FROM app.scores WHERE assignment_id IN (SELECT id FROM app.assignments WHERE judge_id = ?)').bind(judgeId).run();
  await env.DB.prepare('DELETE FROM app.assignments WHERE judge_id = ?').bind(judgeId).run();
  await env.DB.prepare('DELETE FROM app.judges WHERE id = ?').bind(judgeId).run();

  return jsonResponse({ success: true });
}

async function handleGetConfigs(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM app.configs ORDER BY key').all();
  const configs: Record<string, any> = {};
  
  for (const row of (result.results || []) as any[]) {
    try {
      configs[row.key] = JSON.parse(row.value);
    } catch {
      configs[row.key] = row.value;
    }
  }

  return jsonResponse({ configs });
}

async function handleUpdateConfig(key: string, request: Request, env: Env): Promise<Response> {
  const body = await parseJSON(request);
  const value = JSON.stringify(body.value);

  await env.DB.prepare(
    'INSERT INTO app.configs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = ?'
  ).bind(key, value, now(), value, now()).run();

  return jsonResponse({ success: true, key, value: body.value });
}
