'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
const USERS_FILE = path.join(__dirname, 'users.json');

const TASK_DEFAULTS = {
  priority: 2, // 1=Urgent, 2=High, 3=Normal, 4=Low
  points: 5,
  tags: ['healthletic'],
  dueDaysOffset: 2,
};

/**
 * Start date = today, due date = today + dueDaysOffset (date-only, no time).
 * @returns {{ start_date: number, due_date: number, start_date_time: boolean, due_date_time: boolean }}
 */
function getDefaultTaskDates() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + TASK_DEFAULTS.dueDaysOffset
  ).getTime();

  return {
    start_date: start,
    due_date: due,
    start_date_time: false,
    due_date_time: false,
  };
}

let userMappings = null;

/**
 * Load assignee name → ClickUp user ID mappings from users.json.
 * @returns {Record<string, number>}
 */
function loadUserMappings() {
  if (userMappings) {
    return userMappings;
  }

  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    userMappings = JSON.parse(raw);
    return userMappings;
  } catch (err) {
    throw new Error(`Failed to load users.json: ${err.message}`);
  }
}

/**
 * Reload user mappings (useful after file updates without restart).
 */
function reloadUserMappings() {
  userMappings = null;
  return loadUserMappings();
}

/**
 * Resolve assignee name to ClickUp user ID.
 * @param {string|null} assigneeName
 * @returns {{ userId: number|null, warning: string|null }}
 */
function resolveAssignee(assigneeName) {
  if (!assigneeName) {
    return { userId: null, warning: 'No assignee specified in document.' };
  }

  const mappings = loadUserMappings();
  const normalizedName = assigneeName.trim();

  if (mappings[normalizedName] !== undefined) {
    return { userId: Number(mappings[normalizedName]), warning: null };
  }

  const caseInsensitiveKey = Object.keys(mappings).find(
    (key) => key.toLowerCase() === normalizedName.toLowerCase()
  );

  if (caseInsensitiveKey) {
    return { userId: Number(mappings[caseInsensitiveKey]), warning: null };
  }

  return {
    userId: null,
    warning: `Assignee "${normalizedName}" not found in users.json. Task will be created unassigned.`,
  };
}

/**
 * Create a ClickUp HTTP client with auth headers.
 * @param {string} apiToken
 * @returns {import('axios').AxiosInstance}
 */
function createClient(apiToken) {
  return axios.create({
    baseURL: CLICKUP_API_BASE,
    headers: {
      Authorization: apiToken,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Create a single ClickUp task.
 * @param {object} options
 * @param {string} options.apiToken
 * @param {string} options.listId
 * @param {string} options.taskTitle
 * @param {string} options.requirements
 * @param {number|null} options.assigneeId
 * @returns {Promise<object>}
 */
async function createTask({ apiToken, listId, taskTitle, requirements, assigneeId }) {
  const client = createClient(apiToken);

  const payload = {
    name: taskTitle,
    description: requirements || '',
    markdown_description: requirements || '',
    priority: TASK_DEFAULTS.priority,
    points: TASK_DEFAULTS.points,
    tags: [...TASK_DEFAULTS.tags],
    ...getDefaultTaskDates(),
  };

  if (assigneeId) {
    payload.assignees = [assigneeId];
  }

  const response = await client.post(`/list/${listId}/task`, payload);
  return response.data;
}

/**
 * Process parsed sections and create ClickUp tasks for each.
 * @param {Array<{ team: string, assignee: string|null, taskTitle: string, requirements: string }>} sections
 * @param {{ apiToken: string, listId: string }} config
 * @returns {Promise<Array<object>>}
 */
async function createTasksFromSections(sections, config) {
  const { apiToken, listId } = config;

  if (!apiToken) {
    throw new Error('CLICKUP_API_TOKEN is not configured.');
  }

  if (!listId) {
    throw new Error('CLICKUP_LIST_ID is not configured.');
  }

  const results = [];

  for (const section of sections) {
    const { userId, warning } = resolveAssignee(section.assignee);

    const result = {
      team: section.team,
      taskTitle: section.taskTitle,
      assignee: section.assignee || 'Unassigned',
      status: 'pending',
      clickupTaskId: null,
      clickupUrl: null,
      clickupStatus: null,
      warning: warning || null,
      error: null,
    };

    try {
      const task = await createTask({
        apiToken,
        listId,
        taskTitle: section.taskTitle,
        requirements: section.requirements,
        assigneeId: userId,
      });

      result.status = 'created';
      result.clickupTaskId = task.id;
      result.clickupUrl = task.url || null;
      result.clickupStatus = task.status?.status || 'Open';
    } catch (err) {
      result.status = 'failed';
      result.error = extractClickUpError(err);
    }

    results.push(result);
  }

  return results;
}

/**
 * Extract a readable error message from ClickUp API errors.
 * @param {Error} err
 * @returns {string}
 */
function extractClickUpError(err) {
  if (err.response) {
    const data = err.response.data;
    if (typeof data === 'string') {
      return data;
    }
    if (data?.err) {
      return data.err;
    }
    if (data?.message) {
      return data.message;
    }
    return `ClickUp API error (${err.response.status})`;
  }

  if (err.code === 'ECONNABORTED') {
    return 'ClickUp API request timed out. Please try again.';
  }

  return err.message || 'Unknown error while creating ClickUp task.';
}

module.exports = {
  TASK_DEFAULTS,
  getDefaultTaskDates,
  loadUserMappings,
  reloadUserMappings,
  resolveAssignee,
  createTask,
  createTasksFromSections,
};
