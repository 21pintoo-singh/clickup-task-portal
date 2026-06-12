'use strict';

const fs = require('fs').promises;
const path = require('path');
const mammoth = require('mammoth');

const TEAM_SECTIONS = [
  'BACKEND TEAM',
  'MOBILE TEAM',
  'QA TEAM',
  'DEVOPS TEAM',
];

/**
 * Extract plain text from a DOCX or TXT file.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf8');
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error('Unsupported file type. Only .docx and .txt files are allowed.');
}

/**
 * Normalize line endings and collapse excessive blank lines.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * Parse a single team section block into structured fields.
 * @param {string} teamName
 * @param {string} block
 * @returns {{ team: string, assignee: string|null, taskTitle: string|null, requirements: string|null }|null}
 */
function parseSectionBlock(teamName, block) {
  const content = block.trim();
  if (!content) {
    return null;
  }

  const assigneeMatch = content.match(/^Assignee:\s*(.+)$/im);
  const titleMatch = content.match(/^Task Title:\s*([\s\S]*?)(?=^Requirements:\s*$|\Z)/im);
  const requirementsMatch = content.match(/^Requirements:\s*([\s\S]*)$/im);

  const assignee = assigneeMatch ? assigneeMatch[1].trim() : null;
  const taskTitle = titleMatch ? titleMatch[1].trim().replace(/\n+/g, ' ') : null;
  const requirements = requirementsMatch ? requirementsMatch[1].trim() : null;

  if (!taskTitle) {
    return null;
  }

  return {
    team: teamName,
    assignee: assignee || null,
    taskTitle,
    requirements: requirements || '',
  };
}

/**
 * Split document text into team sections and parse each one.
 * @param {string} text
 * @returns {Array<{ team: string, assignee: string|null, taskTitle: string, requirements: string }>}
 */
function parseDocument(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    throw new Error('The uploaded document is empty.');
  }

  const sections = [];
  const headerRegex = new RegExp(
    `^(${TEAM_SECTIONS.join('|')})\\s*$`,
    'gim'
  );

  const matches = [...normalized.matchAll(headerRegex)];

  if (matches.length === 0) {
    throw new Error(
      'No valid team sections found. Expected: BACKEND TEAM, MOBILE TEAM, QA TEAM, or DEVOPS TEAM.'
    );
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const teamName = match[1].toUpperCase();
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
    const block = normalized.slice(start, end);

    const parsed = parseSectionBlock(teamName, block);
    if (parsed) {
      sections.push(parsed);
    }
  }

  if (sections.length === 0) {
    throw new Error(
      'Team sections were found but none contained a valid Task Title. Please check the document format.'
    );
  }

  return sections;
}

/**
 * Parse a requirement document file and return structured task data.
 * @param {string} filePath
 * @returns {Promise<Array<{ team: string, assignee: string|null, taskTitle: string, requirements: string }>>}
 */
async function parseRequirementFile(filePath) {
  const text = await extractText(filePath);
  return parseDocument(text);
}

module.exports = {
  TEAM_SECTIONS,
  extractText,
  parseDocument,
  parseRequirementFile,
};
