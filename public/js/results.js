'use strict';

const noDataMessage = document.getElementById('noDataMessage');
const resultsContent = document.getElementById('resultsContent');
const resultsSummary = document.getElementById('resultsSummary');
const summaryAlert = document.getElementById('summaryAlert');
const resultsTableBody = document.getElementById('resultsTableBody');

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getStatusBadge(status) {
  const labels = {
    created: 'Task Created',
    failed: 'Failed',
    pending: 'Pending',
  };

  const classes = {
    created: 'status-created',
    failed: 'status-failed',
    pending: 'status-pending',
  };

  const label = labels[status] || status;
  const cls = classes[status] || 'status-pending';

  return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderResults(data) {
  const { summary, results, message, success } = data;

  resultsSummary.textContent = `${summary.created} of ${summary.total} tasks created successfully`;

  summaryAlert.className = `alert mb-4 ${success ? 'alert-success' : 'alert-warning'}`;
  summaryAlert.innerHTML = `<i class="bi bi-${success ? 'check-circle' : 'exclamation-triangle'} me-2"></i>${escapeHtml(message)}`;

  resultsTableBody.innerHTML = results
    .map((item) => {
      const taskIdCell = item.clickupTaskId
        ? item.clickupUrl
          ? `<a href="${escapeHtml(item.clickupUrl)}" target="_blank" rel="noopener noreferrer" class="task-id-link">${escapeHtml(item.clickupTaskId)}</a>`
          : `<span class="task-id-link">${escapeHtml(item.clickupTaskId)}</span>`
        : '<span class="text-muted">—</span>';

      const actionCell = item.clickupUrl
        ? `<a href="${escapeHtml(item.clickupUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary"><i class="bi bi-box-arrow-up-right"></i></a>`
        : '';

      const notes = [];
      if (item.warning) notes.push(item.warning);
      if (item.error) notes.push(item.error);
      const notesHtml = notes.length
        ? `<div class="text-danger small mt-1">${escapeHtml(notes.join(' '))}</div>`
        : '';

      const clickupStatus = item.clickupStatus
        ? `<div class="text-muted small">ClickUp: ${escapeHtml(item.clickupStatus)}</div>`
        : '';

      return `
        <tr>
          <td><span class="badge text-bg-secondary">${escapeHtml(item.team)}</span></td>
          <td>
            <div class="fw-medium">${escapeHtml(item.taskTitle)}</div>
            ${notesHtml}
          </td>
          <td>${escapeHtml(item.assignee)}</td>
          <td>${taskIdCell}</td>
          <td>
            ${getStatusBadge(item.status)}
            ${clickupStatus}
          </td>
          <td class="text-end">${actionCell}</td>
        </tr>
      `;
    })
    .join('');
}

function init() {
  const raw = sessionStorage.getItem('taskResults');

  if (!raw) {
    noDataMessage.classList.remove('d-none');
    return;
  }

  try {
    const data = JSON.parse(raw);
    resultsContent.classList.remove('d-none');
    renderResults(data);
  } catch {
    noDataMessage.classList.remove('d-none');
  }
}

init();
