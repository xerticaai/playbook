// Firebase Auth: FIREBASE_CONFIG, ALLOWED_EMAILS, signInWithGoogle, onAuthStateChanged

// ===== FIREBASE AUTH GUARD =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCKEpr6fQVQHtrYe4rNHuPkjJebZn0ePBQ",
  authDomain: "operaciones-br.firebaseapp.com",
  projectId: "operaciones-br",
  storageBucket: "operaciones-br.firebasestorage.app",
  messagingSenderId: "789640198008",
  appId: "1:789640198008:web:9506ae861e435007fb7a8d"
};

const ALLOWED_EMAILS = [
  "amalia.silva@xertica.com",
  "barbara.pessoa@xertica.com",
  "gustavo.paula@xertica.com"
];

if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const _fbAuth = firebase.auth();

const _overlay   = document.getElementById('auth-overlay');
const _errorBox  = document.getElementById('auth-error');
const _loadBox   = document.getElementById('auth-loading');
const _userChip  = document.getElementById('auth-user-chip');
const _signInBtn = document.getElementById('auth-google-btn');

// Email do usuário autenticado pelo Firebase – usado por resolveAdminAccess()
// para verificar acesso admin sem depender de headers do Cloud Run IAP.
window._firebaseAuthEmail = null;

function _showAuthError(msg) {
  _errorBox.textContent = msg;
  _errorBox.style.display = 'block';
  _loadBox.style.display  = 'none';
  if (_signInBtn) _signInBtn.style.display = 'flex';
}

function _revealApp(user) {
  // Expõe email para o resto do app (admin.js, etc.)
  window._firebaseAuthEmail = (user.email || '').toLowerCase().trim();

  _userChip.innerHTML = '&#10003;&nbsp;' + user.email;
  _userChip.style.display = 'flex';
  _loadBox.style.display  = 'none';
  if (_signInBtn) _signInBtn.style.display = 'none';
  _errorBox.style.display = 'none';
  setTimeout(() => {
    _overlay.classList.add('fade-out');
    setTimeout(() => { _overlay.style.display = 'none'; }, 600);
  }, 800);

  // Re-avalia acesso admin agora que o email Firebase está disponível.
  // É necessário pois inicializacao.js chama resolveAdminAccess() antes
  // do Firebase Auth terminar (race condition).
  if (typeof resolveAdminAccess === 'function') {
    resolveAdminAccess();
  }
}

window.signInWithGoogle = async function() {
  _errorBox.style.display = 'none';
  if (_signInBtn) _signInBtn.style.display = 'none';
  _loadBox.style.display = 'block';
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'xertica.com', prompt: 'select_account' });
  try {
    await _fbAuth.signInWithPopup(provider);
  } catch (e) {
    _showAuthError('Falha ao autenticar: ' + (e.message || e.code || e));
  }
};

_fbAuth.onAuthStateChanged(user => {
  if (!_overlay) return;
  if (user) {
    const email = (user.email || '').toLowerCase().trim();
    if (ALLOWED_EMAILS.includes(email)) {
      _revealApp(user);
    } else {
      _fbAuth.signOut();
      window._firebaseAuthEmail = null;
      _showAuthError('Acesso negado. ' + user.email + ' não está na lista de usuários autorizados.');
    }
  } else {
    window._firebaseAuthEmail = null;
    _overlay.style.display = 'flex';
    _overlay.classList.remove('fade-out');
    _loadBox.style.display  = 'none';
    if (_signInBtn) _signInBtn.style.display = 'flex';
    _errorBox.style.display = 'none';
    _userChip.style.display = 'none';
  }
});
