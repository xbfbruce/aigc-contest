/**
 * AIGC Contest API Client
 * 
 * Unified API client for all backend operations
 * Replaces localStorage with cloud database calls
 */

const API_BASE = '/api';

class APIClient {
  constructor() {
    this.currentUser = null;
  }

  // Helper: Make HTTP request
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Request Failed:', error);
      throw error;
    }
  }

  // ===== Authentication =====

  /**
   * Login user
   * @param {string} account - Account name
   * @param {string} password - Password
   * @param {string} role - Role: 'admin', 'judge', or 'contestant'
   * @returns {Promise<{success: boolean, user: object}>}
   */
  async login(account, password, role) {
    const result = await this.request('/auth/login', {
      method: 'POST',
      body: { account, password, role },
    });

    if (result.success) {
      this.currentUser = result.user;
      sessionStorage.setItem('currentUser', JSON.stringify(result.user));
    }

    return result;
  }

  /**
   * Register contestant
   * @param {string} name - Contestant name
   * @param {string} school - School name
   * @returns {Promise<{success: boolean, contestant: object}>}
   */
  async registerContestant(name, school) {
    return await this.request('/auth/register', {
      method: 'POST',
      body: { name, school },
    });
  }

  /**
   * Logout current user
   */
  logout() {
    this.currentUser = null;
    sessionStorage.removeItem('currentUser');
  }

  /**
   * Get current logged-in user from session
   */
  getCurrentUser() {
    if (!this.currentUser) {
      const stored = sessionStorage.getItem('currentUser');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    }
    return this.currentUser;
  }

  // ===== Works =====

  /**
   * Submit a new work
   * @param {object} workData - Work submission data
   * @returns {Promise<{success: boolean, work: object}>}
   */
  async submitWork(workData) {
    return await this.request('/works', {
      method: 'POST',
      body: workData,
    });
  }

  /**
   * List works with optional filters
   * @param {object} filters - Optional filters: category, status, contestant_id
   * @returns {Promise<{works: Array}>}
   */
  async listWorks(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const query = params.toString();
    return await this.request(`/works${query ? '?' + query : ''}`);
  }

  /**
   * Get work details by ID
   * @param {string} workId - Work ID
   * @returns {Promise<{work: object}>}
   */
  async getWork(workId) {
    return await this.request(`/works/${workId}`);
  }

  /**
   * Delete a work
   * @param {string} workId - Work ID to delete
   * @returns {Promise<{success: boolean}>}
   */
  async deleteWork(workId) {
    return await this.request(`/works/${workId}`, {
      method: 'DELETE',
    });
  }

  // ===== Assignments =====

  /**
   * Assign works to a judge
   * @param {string} judgeId - Judge ID
   * @param {Array<string>} workIds - Array of work IDs
   * @returns {Promise<{success: boolean, assignments: Array}>}
   */
  async createAssignments(judgeId, workIds) {
    return await this.request('/assignments', {
      method: 'POST',
      body: { judge_id: judgeId, work_ids: workIds },
    });
  }

  /**
   * List assignments with optional filters
   * @param {object} filters - Optional filters: judge_id, work_id
   * @returns {Promise<{assignments: Array}>}
   */
  async listAssignments(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const query = params.toString();
    return await this.request(`/assignments${query ? '?' + query : ''}`);
  }

  /**
   * Delete an assignment
   * @param {string} judgeId - Judge ID
   * @param {string} workId - Work ID
   * @returns {Promise<{success: boolean}>}
   */
  async deleteAssignment(judgeId, workId) {
    return await this.request('/assignments', {
      method: 'DELETE',
      body: { judge_id: judgeId, work_id: workId },
    });
  }

  // ===== Scores =====

  /**
   * Submit or update a score
   * @param {object} scoreData - Score data including assignment_id and scores
   * @returns {Promise<{success: boolean, score: object}>}
   */
  async submitScore(scoreData) {
    return await this.request('/scores', {
      method: 'POST',
      body: scoreData,
    });
  }

  /**
   * List scores with optional filters
   * @param {object} filters - Optional filters: work_id, judge_id
   * @returns {Promise<{scores: Array}>}
   */
  async listScores(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const query = params.toString();
    return await this.request(`/scores${query ? '?' + query : ''}`);
  }

  // ===== Judges =====

  /**
   * Create a new judge account
   * @param {string} account - Judge account name
   * @param {string} password - Password
   * @param {string} name - Judge name
   * @returns {Promise<{success: boolean, judge: object}>}
   */
  async createJudge(account, password, name) {
    return await this.request('/judges', {
      method: 'POST',
      body: { account, password, name },
    });
  }

  /**
   * List all judges
   * @returns {Promise<{judges: Array}>}
   */
  async listJudges() {
    return await this.request('/judges');
  }

  /**
   * Delete a judge
   * @param {string} judgeId - Judge ID to delete
   * @returns {Promise<{success: boolean}>}
   */
  async deleteJudge(judgeId) {
    return await this.request(`/judges/${judgeId}`, {
      method: 'DELETE',
    });
  }

  // ===== Configs =====

  /**
   * Get all configurations
   * @returns {Promise<{configs: object}>}
   */
  async getConfigs() {
    return await this.request('/configs');
  }

  /**
   * Update a configuration value
   * @param {string} key - Config key
   * @param {any} value - Config value
   * @returns {Promise<{success: boolean, key: string, value: any}>}
   */
  async updateConfig(key, value) {
    return await this.request(`/configs/${key}`, {
      method: 'PUT',
      body: { value },
    });
  }
}

// Create singleton instance
const api = new APIClient();

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
