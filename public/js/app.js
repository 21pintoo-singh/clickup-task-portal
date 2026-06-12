'use strict';

const ALLOWED_EXTENSIONS = ['.docx', '.txt'];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const uploadForm = document.getElementById('uploadForm');
const uploadBtn = document.getElementById('uploadBtn');
const uploadBtnText = document.getElementById('uploadBtnText');
const uploadBtnSpinner = document.getElementById('uploadBtnSpinner');
const alertContainer = document.getElementById('alertContainer');

let selectedFile = null;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getExtension(filename) {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function showAlert(message, type = 'danger') {
  alertContainer.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${escapeHtml(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}

function clearAlert() {
  alertContainer.innerHTML = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function validateFile(file) {
  const ext = getExtension(file.name);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return 'Invalid file type. Please upload a .docx or .txt file.';
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
  }

  if (file.size === 0) {
    return 'The selected file is empty.';
  }

  return null;
}

function setSelectedFile(file) {
  const error = validateFile(file);
  if (error) {
    showAlert(error);
    clearFileSelection();
    return;
  }

  clearAlert();
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  filePreview.classList.remove('d-none');
  uploadBtn.disabled = false;
}

function clearFileSelection() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.classList.add('d-none');
  uploadBtn.disabled = true;
}

function setLoading(isLoading) {
  uploadBtn.disabled = isLoading || !selectedFile;
  uploadBtnText.classList.toggle('d-none', isLoading);
  uploadBtnSpinner.classList.toggle('d-none', !isLoading);
}

// Drag and drop handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    setSelectedFile(files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) {
    setSelectedFile(fileInput.files[0]);
  }
});

removeFileBtn.addEventListener('click', () => {
  clearFileSelection();
  clearAlert();
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedFile) {
    showAlert('Please select a file before uploading.');
    return;
  }

  const validationError = validateFile(selectedFile);
  if (validationError) {
    showAlert(validationError);
    return;
  }

  setLoading(true);
  clearAlert();

  const formData = new FormData();
  formData.append('document', selectedFile);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.error || 'Upload failed. Please try again.');
      return;
    }

    sessionStorage.setItem('taskResults', JSON.stringify(data));
    window.location.href = '/results.html';
  } catch {
    showAlert('Network error. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
});
