/* ============================================
   FinRAG — Main interactions
   ============================================ */

/* ---------- Reveal on scroll ---------- */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  els.forEach(e => io.observe(e));
}

/* ---------- Feature card spotlight ---------- */
function initSpotlight() {
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
}

/* ---------- Animated login characters (eye tracking + blink) ---------- */
function initCharacters() {
  const stage = document.getElementById('char-stage');
  if (!stage) return;
  const pupils = stage.querySelectorAll('.pupil, .pupil-only');

  document.addEventListener('mousemove', (e) => {
    pupils.forEach(p => {
      const r = p.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const dist = Math.min(Math.hypot(e.clientX - cx, e.clientY - cy), 4);
      p.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
    });
  });

  // random blink for the eyes with whites
  const eyes = stage.querySelectorAll('.eye');
  function blink() {
    eyes.forEach(eye => eye.classList.add('flat'));
    setTimeout(() => eyes.forEach(eye => eye.classList.remove('flat')), 150);
    setTimeout(blink, 3000 + Math.random() * 4000);
  }
  setTimeout(blink, 3000);

  // characters lean toward the password when typing it
  const stageChars = stage.querySelectorAll('.character');
  const passInput = document.getElementById('password');
  if (passInput) {
    passInput.addEventListener('focus', () => {
      stageChars.forEach(c => c.style.transform = 'skewX(-8deg)');
    });
    passInput.addEventListener('blur', () => {
      stageChars.forEach(c => c.style.transform = '');
    });
  }
}

/* ---------- Auth modal logic ---------- */
let authMode = 'login';

function openAuth() { document.getElementById('auth-modal').classList.add('open'); }
function closeAuth() { document.getElementById('auth-modal').classList.remove('open'); }

function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById('auth-title');
  const sub = document.getElementById('auth-sub');
  const submit = document.getElementById('auth-submit');
  const nameField = document.getElementById('name-field');
  const loginExtra = document.getElementById('login-extra');
  const switchWrap = document.getElementById('auth-switch');

  if (mode === 'signup') {
    title.textContent = 'Create your account';
    sub.textContent = 'Start chatting with your documents today';
    submit.textContent = 'Sign Up';
    nameField.style.display = 'block';
    loginExtra.style.display = 'none';
    switchWrap.innerHTML = 'Already have an account? <a href="#" id="switch-link">Log in</a>';
  } else {
    title.textContent = 'Welcome back!';
    sub.textContent = 'Please enter your details to continue';
    submit.textContent = 'Log in';
    nameField.style.display = 'none';
    loginExtra.style.display = 'flex';
    switchWrap.innerHTML = "Don't have an account? <a href=\"#\" id=\"switch-link\">Sign Up</a>";
  }
  document.getElementById('switch-link').addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
  });
  document.getElementById('auth-error').classList.remove('show');
}

function initLanding() {
  initReveal();
  initSpotlight();
  initCharacters();

  document.getElementById('open-login').addEventListener('click', openAuth);
  document.getElementById('hero-start').addEventListener('click', openAuth);
  document.getElementById('close-auth').addEventListener('click', closeAuth);
  document.getElementById('auth-modal').addEventListener('click', (e) => {
    if (e.target.id === 'auth-modal') closeAuth();
  });

  // password toggle
  document.getElementById('toggle-pass').addEventListener('click', () => {
    const inp = document.getElementById('password');
    const icon = document.querySelector('#toggle-pass i');
    if (inp.type === 'password') { inp.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; }
    else { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
  });

  setAuthMode('login');

  // submit -> real signup/login call against the FastAPI backend
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value.trim();
    const err = document.getElementById('auth-error');
    err.classList.remove('show');

    if (!email || !pass) {
      err.textContent = 'Please fill in all required fields.';
      err.classList.add('show');
      return;
    }
    if (authMode === 'signup' && !document.getElementById('name').value.trim()) {
      err.textContent = 'Please tell us your name.';
      err.classList.add('show');
      return;
    }

    const submit = document.getElementById('auth-submit');
    const originalLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = authMode === 'signup' ? 'Creating...' : 'Signing in...';

    try {
      const endpoint = authMode === 'signup'
        ? `${API_BASE_URL}/api/signup`
        : `${API_BASE_URL}/api/login`;
      const body = authMode === 'signup'
        ? { name: document.getElementById('name').value.trim(), email, password: pass }
        : { email, password: pass };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.detail || 'Something went wrong. Please try again.');
      }

      try {
        sessionStorage.setItem('finrag_token', result.token);
        sessionStorage.setItem('finrag_user', result.name);
        sessionStorage.setItem('finrag_email', result.email);
      } catch (e) { }

      window.location.href = 'upload.html';
    } catch (err2) {
      err.textContent = err2.message;
      err.classList.add('show');
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
  });

  document.getElementById('google-btn').addEventListener('click', () => {
    const err = document.getElementById('auth-error');
    err.textContent = 'Google sign-in is not available in this demo — please use email + password.';
    err.classList.add('show');
  });
}
