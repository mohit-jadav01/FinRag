/* ============================================
   FinRAG — Chatbot (no history saved)
   ============================================ */

const FINANCE_QUOTES = [
  { q: 'An investment in <b>knowledge</b> pays the best interest.', a: 'Benjamin Franklin' },
  { q: 'The four most dangerous words in investing are: <b>this time it\'s different.</b>', a: 'Sir John Templeton' },
  { q: 'It\'s not how much money you make, but how much you <b>keep</b>.', a: 'Robert Kiyosaki' },
  { q: 'Risk comes from <b>not knowing</b> what you\'re doing.', a: 'Warren Buffett' },
  { q: 'In investing, what is comfortable is rarely <b>profitable</b>.', a: 'Robert Arnott' },
  { q: 'Beware of little expenses; a small leak will <b>sink a great ship</b>.', a: 'Benjamin Franklin' },
  { q: 'The stock market is a device for transferring money from the <b>impatient</b> to the <b>patient</b>.', a: 'Warren Buffett' },
];

const TYPE_ICONS = {
  pdf: 'fa-file-pdf', excel: 'fa-file-excel', csv: 'fa-file-csv', json: 'fa-file-code',
  sqlite: 'fa-database', ppt: 'fa-file-powerpoint', html: 'fa-file-lines', text: 'fa-file-alt'
};

function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

let docFiles = [];
let docType = 'pdf';
let userName = 'Analyst';

function setRandomQuote() {
  const pick = FINANCE_QUOTES[Math.floor(Math.random() * FINANCE_QUOTES.length)];
  document.getElementById('finance-quote').innerHTML = `“${pick.q}”`;
  document.getElementById('quote-author').textContent = '— ' + pick.a;
}

function renderChips() {
  const bar = document.getElementById('file-chips');
  const icon = TYPE_ICONS[docType] || 'fa-file';
  if (!docFiles.length) {
    bar.innerHTML = `<span class="file-chip"><i class="fa-solid fa-circle-info"></i> No document loaded · <a href="upload.html" style="color:var(--cyan-light)">upload one</a></span>`;
    return;
  }
  bar.innerHTML = docFiles.map(f =>
    `<span class="file-chip"><i class="fa-solid ${icon}"></i> ${f.name} <span class="sz">· ${fmtSize(f.size)}</span></span>`
  ).join('');
}

function addMessage(text, who) {
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  const avatar = who === 'bot'
    ? '<div class="avatar"><i class="fa-solid fa-robot"></i></div>'
    : '<div class="avatar"><i class="fa-solid fa-user"></i></div>';
  div.innerHTML = `${avatar}<div class="bubble">${text}</div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
  return div;
}

function showTyping() {
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}
function hideTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

/* Escape user text before it's dropped into innerHTML */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ══════════════════════════════════════════════════════════════
   Built-in Markdown → HTML renderer  (no CDN / no dependencies)
   Handles: headings, horizontal rules, bold, italic, inline code,
            ordered lists, unordered lists, GFM tables.
   ══════════════════════════════════════════════════════════════ */
function renderMarkdown(md) {
  // Safely escape a raw string for HTML attribute / text content
  const esc = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply inline formatting (bold, italic, code) to an already-escaped string
  function inline(raw) {
    return esc(raw)
      // Bold + italic  ***text***
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      // Bold           **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic         *text*
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code    `text`
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  const lines = md.split('\n');
  let out = '';
  let listTag = '';        // current open list tag: 'ol' | 'ul' | ''
  let tableRows = [];      // buffered table rows (arrays of cell strings)

  function closeList() {
    if (listTag) { out += `</${listTag}>`; listTag = ''; }
  }

  function isSeparatorRow(cells) {
    return cells.every(c => /^:?-{1,}:?$/.test(c.trim()));
  }

  function flushTable() {
    if (!tableRows.length) return;
    // Strip separator rows, keep data rows
    const data = tableRows.filter(r => !isSeparatorRow(r));
    tableRows = [];
    if (!data.length) return;

    const [head, ...body] = data;
    let t = '<table>';
    t += '<thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>';
    if (body.length) {
      t += '<tbody>';
      body.forEach(row => {
        t += '<tr>' + row.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
      });
      t += '</tbody>';
    }
    t += '</table>';
    out += t;
  }

  for (const raw of lines) {
    const line = raw.trim();

    /* ── Table row ───────────────────────────────────────────── */
    if (line.startsWith('|') && line.endsWith('|') && line.length > 1) {
      closeList();
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      tableRows.push(cells);
      continue;
    } else if (tableRows.length) {
      flushTable();
    }

    /* ── Horizontal rule ─────────────────────────────────────── */
    if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
      closeList();
      out += '<hr>';
      continue;
    }

    /* ── Headings ────────────────────────────────────────────── */
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      closeList();
      const lvl = hm[1].length;
      out += `<h${lvl}>${inline(hm[2])}</h${lvl}>`;
      continue;
    }

    /* ── Ordered list item ───────────────────────────────────── */
    const olm = line.match(/^(\d+)[.)]\s+(.+)/);
    if (olm) {
      if (listTag !== 'ol') { closeList(); out += '<ol>'; listTag = 'ol'; }
      out += `<li>${inline(olm[2])}</li>`;
      continue;
    }

    /* ── Unordered list item ─────────────────────────────────── */
    const ulm = line.match(/^[-*+]\s+(.+)/);
    if (ulm) {
      if (listTag !== 'ul') { closeList(); out += '<ul>'; listTag = 'ul'; }
      out += `<li>${inline(ulm[1])}</li>`;
      continue;
    }

    /* ── Empty line ──────────────────────────────────────────── */
    if (!line) {
      closeList();
      continue;
    }

    /* ── Normal paragraph line ───────────────────────────────── */
    closeList();
    out += `<p>${inline(line)}</p>`;
  }

  closeList();
  flushTable();
  return out;
}


/* Real RAG call to the FastAPI backend (Mistral embeddings + chat model) */
async function askBackend(question) {
  const token = sessionStorage.getItem('finrag_token');
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ message: question }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Something went wrong while answering.');
  }
  return data.answer;
}

async function handleSend() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  addMessage(escapeHtml(text), 'user');
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  showTyping();
  try {
    const answer = await askBackend(text);
    hideTyping();
    // Render the AI response as markdown (tables, bold, headings, hr …)
    addMessage(renderMarkdown(answer), 'bot');
  } catch (err) {
    hideTyping();
    addMessage(`<span style="color:#ef4444;">${escapeHtml(err.message)}</span>`, 'bot');
  } finally {
    document.getElementById('send-btn').disabled = false;
  }
}

function initChat() {
  const token = sessionStorage.getItem('finrag_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  try {
    userName = sessionStorage.getItem('finrag_user') || 'Analyst';
    docType = sessionStorage.getItem('finrag_type') || 'pdf';
    docFiles = JSON.parse(sessionStorage.getItem('finrag_files') || '[]');
  } catch (e) { }

  setRandomQuote();
  renderChips();

  const input = document.getElementById('chat-input');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 130) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  document.getElementById('send-btn').addEventListener('click', handleSend);

  document.querySelectorAll('.suggestion').forEach(s => {
    s.addEventListener('click', () => {
      input.value = s.textContent;
      handleSend();
    });
  });

  // confirm session + real uploaded files with the backend, and fire the
  // one-time welcome email on first chat entry
  fetch('/api/chat/init', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
    .then(res => {
      if (!res.ok) throw new Error('session invalid');
      return res.json();
    })
    .then(info => {
      userName = info.name;
      if (info.files && info.files.length) docFiles = info.files;
      renderChips();

      const fileName = docFiles.length ? docFiles[0].name : 'your document';
      if (info.has_documents) {
        addMessage(`Hi ${userName}! 👋 I've indexed <b>${fileName}</b> and I'm ready. Ask me anything about it — figures, trends, risks or a summary.`, 'bot');
      } else {
        addMessage(`Hi ${userName}! 👋 I don't see an uploaded document yet — head back and upload one to get grounded answers.`, 'bot');
      }
    })
    .catch(() => {
      sessionStorage.removeItem('finrag_token');
      window.location.href = 'index.html';
    });
}
