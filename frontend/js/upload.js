/* ============================================
   FinRAG — File type selection + upload
   ============================================ */

const FILE_TYPES = [
  { id: 'pdf', name: 'PDF', desc: 'Reports & filings', icon: 'fa-file-pdf', accept: '.pdf', color: '#ef4444' },
  { id: 'excel', name: 'Excel', desc: '.xlsx / .xls', icon: 'fa-file-excel', accept: '.xlsx,.xls', color: '#22c55e' },
  { id: 'csv', name: 'CSV', desc: 'Comma-separated', icon: 'fa-file-csv', accept: '.csv', color: '#10b981' },
  { id: 'json', name: 'JSON', desc: 'Structured data', icon: 'fa-file-code', accept: '.json', color: '#f59e0b' },
  { id: 'sqlite', name: 'SQLite', desc: 'Database file', icon: 'fa-database', accept: '.sqlite,.db', color: '#06b6d4' },
  { id: 'ppt', name: 'PowerPoint', desc: '.pptx / .ppt', icon: 'fa-file-powerpoint', accept: '.pptx,.ppt', color: '#f97316' },
  { id: 'html', name: 'HTML', desc: 'Web template', icon: 'fa-file-lines', accept: '.html,.htm', color: '#3b82f6' },
  { id: 'text', name: 'Text', desc: 'Plain .txt', icon: 'fa-file-alt', accept: '.txt', color: '#a78bfa' },
];

let selectedType = null;
let uploadedFiles = [];

function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function renderFileTypes() {
  const grid = document.getElementById('filetype-grid');
  grid.innerHTML = FILE_TYPES.map(t => `
    <div class="ft-card" data-id="${t.id}" style="--glow:${hexToGlow(t.color)};">
      <div class="check"><i class="fa-solid fa-check"></i></div>
      <div class="ft-icon" style="background:${hexToGlow(t.color, 0.15)};border:1px solid ${hexToGlow(t.color, 0.4)};color:${t.color};">
        <i class="fa-solid ${t.icon}"></i>
      </div>
      <h3>${t.name}</h3>
      <p>${t.desc}</p>
    </div>
  `).join('');

  grid.querySelectorAll('.ft-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    card.addEventListener('click', () => selectType(card.dataset.id));
  });
}

function hexToGlow(hex, alpha = 0.3) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function selectType(id) {
  selectedType = FILE_TYPES.find(t => t.id === id);
  document.querySelectorAll('.ft-card').forEach(c =>
    c.classList.toggle('selected', c.dataset.id === id));

  const dz = document.getElementById('dropzone');
  dz.classList.remove('disabled');
  document.getElementById('dz-title').textContent = `Upload your ${selectedType.name} file`;
  document.getElementById('dz-sub').innerHTML = 'Drag &amp; drop here, or <span class="browse">browse</span>';
  document.getElementById('dz-hint').textContent = 'Accepted: ' + selectedType.accept;
  document.getElementById('file-input').setAttribute('accept', selectedType.accept);
}

function addFiles(fileList) {
  if (!selectedType) return;
  Array.from(fileList).forEach(file => {
    const id = 'f' + Date.now() + Math.random().toString(36).slice(2, 6);
    const entry = { id, name: file.name, size: file.size, progress: 0, error: null };
    uploadedFiles.push(entry);
    renderFiles();
    realUpload(id, file);
  });
}

function realUpload(id, file) {
  const token = sessionStorage.getItem('finrag_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const form = new FormData();
  form.append('file_type', selectedType.id);
  form.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API_BASE_URL}/api/upload`);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);

  xhr.upload.addEventListener('progress', (e) => {
    const f = uploadedFiles.find(x => x.id === id);
    if (!f || !e.lengthComputable) return;
    // cap visual progress at 95% until the server confirms ingestion is done
    f.progress = Math.min((e.loaded / e.total) * 95, 95);
    renderFiles();
  });

  xhr.onload = () => {
    const f = uploadedFiles.find(x => x.id === id);
    if (!f) return;
    let payload = {};
    try { payload = JSON.parse(xhr.responseText); } catch (e) { }

    if (xhr.status >= 200 && xhr.status < 300) {
      f.progress = 100;
      f.chunks = payload.chunks;
    } else {
      f.error = payload.detail || 'Upload failed.';
      f.progress = 0;
    }
    renderFiles();
    checkContinue();
  };

  xhr.onerror = () => {
    const f = uploadedFiles.find(x => x.id === id);
    if (!f) return;
    f.error = 'Network error while uploading.';
    f.progress = 0;
    renderFiles();
    checkContinue();
  };

  xhr.send(form);
}

function renderFiles() {
  const list = document.getElementById('file-list');
  list.innerHTML = uploadedFiles.map(f => {
    const done = f.progress >= 100 && !f.error;
    return `
      <div class="file-row ${done ? 'done' : ''}">
        <div class="f-icon"><i class="fa-solid ${selectedType ? selectedType.icon : 'fa-file'}"></i></div>
        <div class="f-info">
          <div class="f-name" title="${f.name}">${f.name}</div>
          ${f.error
        ? `<div class="f-meta" style="color:#ef4444;">${f.error}</div>`
        : `<div class="f-meta"><span>${fmtSize(f.size)}</span><span>${Math.round(f.progress)}%</span></div>
               <div class="progress"><span style="width:${f.progress}%"></span></div>`}
        </div>
        <button class="f-action ${(!done && !f.error) ? 'spin' : ''}" data-id="${f.id}">
          <i class="fa-solid ${(!done && !f.error) ? 'fa-spinner' : 'fa-trash-can'}"></i>
        </button>
      </div>`;
  }).join('');

  list.querySelectorAll('.f-action').forEach(btn => {
    if (!btn.classList.contains('spin')) {
      btn.addEventListener('click', () => {
        uploadedFiles = uploadedFiles.filter(x => x.id !== btn.dataset.id);
        renderFiles();
        checkContinue();
      });
    }
  });
}

function checkContinue() {
  const ready = uploadedFiles.length > 0 && uploadedFiles.every(f => f.progress >= 100 && !f.error);
  document.getElementById('continue-btn').disabled = !ready;
}

function initUpload() {
  // auth guard: must have a valid session token from login/signup
  const token = sessionStorage.getItem('finrag_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  // restore user name (cached client-side, confirmed by the backend)
  try {
    const u = sessionStorage.getItem('finrag_user');
    if (u) document.getElementById('user-name').textContent = u;
  } catch (e) { }

  fetch(`${API_BASE_URL}/api/session`, {
    headers: { Authorization: 'Bearer ' + token },
    credentials: 'include',
  })
    .then(res => {
      if (!res.ok) throw new Error('session invalid');
      return res.json();
    })
    .then(info => {
      document.getElementById('user-name').textContent = info.name;
    })
    .catch(() => {
      sessionStorage.removeItem('finrag_token');
      window.location.href = 'index.html';
    });

  renderFileTypes();

  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');

  dz.addEventListener('click', () => { if (selectedType) input.click(); });
  dz.addEventListener('dragover', (e) => { e.preventDefault(); if (selectedType) dz.classList.add('dragging'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('dragging');
    if (selectedType) addFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', (e) => { if (e.target.files) addFiles(e.target.files); });

  document.getElementById('continue-btn').addEventListener('click', () => {
    // persist file meta for chat page
    try {
      sessionStorage.setItem('finrag_files', JSON.stringify(
        uploadedFiles.map(f => ({ name: f.name, size: f.size }))
      ));
      sessionStorage.setItem('finrag_type', selectedType.id);
    } catch (e) { }
    window.location.href = 'chat.html';
  });
}
