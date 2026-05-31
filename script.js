import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

/*
  FICHEIROS DOS PROJETOS
  1) Cria a pasta assets/projetos/
  2) Envia os produtos e vídeos para essa pasta
  3) Altera productUrl e videoUrl abaixo.
  Exemplo: productUrl: 'assets/projetos/capuccino-news/produto.pdf'
*/
const projects = [
  { turma: '12.ºF', nome: 'Capuccino News', productUrl: '', videoUrl: '' },
  { turma: '12.ºF', nome: 'IA e democracia: Informar ou manipular?', productUrl: '', videoUrl: '' },
  { turma: '12.ºF', nome: 'Infocraft', productUrl: '', videoUrl: '' },
  { turma: '12.ºF', nome: 'Skyscratcher', productUrl: '', videoUrl: '' },
  { turma: '12.ºF', nome: 'Voltsun', productUrl: '', videoUrl: '' },
  { turma: '12.ºH', nome: 'Cinco Minutos de Futuro', sufixo: 'Grupo 1', productUrl: '', videoUrl: '' },
  { turma: '12.ºH', nome: 'BIG6', productUrl: '', videoUrl: '' },
  { turma: '12.ºH', nome: 'Bugados mas Informados', productUrl: '', videoUrl: '' },
  { turma: '12.ºH', nome: 'Cinco Minutos de Futuro', sufixo: 'Grupo 4', productUrl: '', videoUrl: '' },
  { turma: '12.ºH', nome: 'Entre Linhas', productUrl: '', videoUrl: 'https://youtu.be/_VYet6RjFg4' }
];

const ALLOWED_DOMAIN = 'aemaia.com';
const VOTES_COLLECTION = 'aib_votes_2026';
const VOTERS_COLLECTION = 'aib_voters_2026';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' });

const votesCollection = collection(db, VOTES_COLLECTION);
let votes = [];
let firebaseReady = false;
let currentUser = null;
let currentVoter = null;
let unsubscribeVotes = null;

const grid = document.querySelector('#projectGrid');
const template = document.querySelector('#projectCardTemplate');
const filter = document.querySelector('#classFilter');
const authStatus = document.querySelector('#authStatus');
const userEmailEl = document.querySelector('#userEmail');
const loginButton = document.querySelector('#loginButton');
const logoutButton = document.querySelector('#logoutButton');
const rankingBody = document.querySelector('#rankingBody');

function slug(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
function projectId(project, index) { return `${slug(project.turma)}-${index + 1}-${slug(project.nome)}${project.sufixo ? '-' + slug(project.sufixo) : ''}`; }
function projectLabel(project) { return project.sufixo ? `${project.nome} (${project.sufixo})` : project.nome; }
function voteDocId(projectIdValue, voterEmail) { return `${projectIdValue}__${voterEmail}`; }
function average(values) { return values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0; }
function isVideoPath(path) { return /\.(mp4|webm|mov)$/i.test(path || ''); }
function votesForProject(id) { return votes.filter(v => v.projectId === id); }
function statsFor(project, index) {
  const id = projectId(project, index);
  const projectVotes = votesForProject(id);
  const productAvg = average(projectVotes.map(v => Number(v.product)));
  const videoAvg = average(projectVotes.map(v => Number(v.video)));
  const finalAvg = projectVotes.length ? average(projectVotes.map(v => (Number(v.product) + Number(v.video)) / 2)) : 0;
  return { id, votes: projectVotes, productAvg, videoAvg, finalAvg };
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase().replace(/\s+/g, '');
}
function isInstitutionalEmail(email) {
  return normaliseEmail(email).endsWith(`@${ALLOWED_DOMAIN}`);
}
async function getAuthorisedVoter(email) {
  const voterRef = doc(db, VOTERS_COLLECTION, normaliseEmail(email));
  const voterSnap = await getDoc(voterRef);
  if (!voterSnap.exists()) return null;
  const data = voterSnap.data();
  if (data.active === false) return null;
  return data;
}
function setAuthMessage(message, type = '') {
  authStatus.textContent = message;
  authStatus.className = `status ${type}`.trim();
}
function setSignedOut(message = 'Entra com o email institucional para votar.') {
  currentUser = null;
  currentVoter = null;
  votes = [];
  firebaseReady = false;
  if (unsubscribeVotes) { unsubscribeVotes(); unsubscribeVotes = null; }
  loginButton.hidden = false;
  logoutButton.hidden = true;
  userEmailEl.textContent = 'Não autenticado';
  setAuthMessage(message);
  renderProjects();
  updateRanking();
}
async function setSignedIn(user) {
  const email = normaliseEmail(user.email);
  userEmailEl.textContent = email;

  if (!isInstitutionalEmail(email)) {
    await signOut(auth);
    setSignedOut(`Email recusado. Usa a conta institucional @${ALLOWED_DOMAIN}.`);
    return;
  }

  const voter = await getAuthorisedVoter(email);
  if (!voter) {
    await signOut(auth);
    setSignedOut('Este email institucional não está na lista de estudantes autorizados. Confirma com a professora.');
    return;
  }

  currentUser = { ...user, email };
  currentVoter = voter;
  loginButton.hidden = true;
  logoutButton.hidden = false;
  setAuthMessage(`Autenticado · ${voter.nome || email}${voter.turma ? ' · ' + voter.turma : ''}`, 'ok');
  subscribeVotes();
  renderProjects();
}
function subscribeVotes() {
  if (unsubscribeVotes) unsubscribeVotes();
  unsubscribeVotes = onSnapshot(votesCollection, snapshot => {
    firebaseReady = true;
    votes = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAtText: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : ''
      };
    });
    renderProjects();
    updateRanking();
  }, error => {
    console.error(error);
    firebaseReady = false;
    setAuthMessage('Erro ao ler votos. Verifica as regras do Firestore.', 'error');
  });
}

function updateRanking() {
  const rows = projects.map((project, index) => ({ project, index, ...statsFor(project, index) }))
    .sort((a, b) => b.finalAvg - a.finalAvg || b.votes.length - a.votes.length || a.project.nome.localeCompare(b.project.nome));
  rankingBody.innerHTML = rows.map((row, pos) => `
    <tr>
      <td>${pos + 1}</td>
      <td>${escapeHtml(row.project.turma)}</td>
      <td>${escapeHtml(projectLabel(row.project))}</td>
      <td>${row.productAvg.toFixed(1)}</td>
      <td>${row.videoAvg.toFixed(1)}</td>
      <td>${row.finalAvg.toFixed(1)}</td>
      <td>${row.votes.length}</td>
    </tr>`).join('');
}

function configureLink(link, url, textWhenReady, textWhenMissing) {
  if (url) {
    link.href = url;
    link.textContent = textWhenReady;
    link.classList.remove('missing');
  } else {
    link.href = '#';
    link.textContent = textWhenMissing;
    link.classList.add('missing');
  }
}

function renderProjects() {
  grid.innerHTML = '';
  const voterEmail = currentUser?.email || '';

  projects.forEach((project, index) => {
    if (filter.value !== 'all' && project.turma !== filter.value) return;
    const { id, votes: projectVotes, productAvg, videoAvg, finalAvg } = statsFor(project, index);
    const card = template.content.cloneNode(true);
    card.querySelector('.badge').textContent = project.sufixo ? `${project.turma} · ${project.sufixo}` : project.turma;
    card.querySelector('h3').textContent = project.nome;

    configureLink(card.querySelector('.productLink'), project.productUrl, 'Abrir produto final', 'Produto ainda não publicado');
    configureLink(card.querySelector('.videoLink'), project.videoUrl, 'Abrir vídeo promocional', 'Vídeo ainda não publicado');

    const preview = card.querySelector('.preview');
    if (isVideoPath(project.videoUrl)) { preview.src = project.videoUrl; preview.hidden = false; }

    const productScore = card.querySelector('.productScore');
    const videoScore = card.querySelector('.videoScore');
    const productOutput = card.querySelector('.productOutput');
    const videoOutput = card.querySelector('.videoOutput');
    const already = card.querySelector('.already');
    const saveStatus = card.querySelector('.saveStatus');
    const voteButton = card.querySelector('.voteButton');
    productScore.addEventListener('input', () => productOutput.value = productScore.value);
    videoScore.addEventListener('input', () => videoOutput.value = videoScore.value);

    const userVote = voterEmail ? projectVotes.find(v => v.voterEmail === voterEmail) : null;

    const hasVoted = Boolean(userVote);
    
    if (hasVoted) {
      productScore.value = Number(userVote.product);
      videoScore.value = Number(userVote.video);
      productOutput.value = Number(userVote.product);
      videoOutput.value = Number(userVote.video);
    } else {
      productScore.value = 10;
      videoScore.value = 10;
      productOutput.value = 10;
      videoOutput.value = 10;
    }

    already.hidden = !hasVoted;
    voteButton.disabled = !currentUser || hasVoted;
    voteButton.textContent = !currentUser ? 'Entra para votar' : hasVoted ? 'Voto já registado' : 'Guardar voto nos dois';

    voteButton.addEventListener('click', async () => {
      if (!currentUser || !currentVoter) { alert('Tens de entrar com o email institucional autorizado.'); return; }
      if (!firebaseReady) { alert('Firebase ainda não está pronto. Verifica a configuração e as regras.'); return; }
      if (hasVoted) { alert('Já votaste neste projeto.'); return; }

      const product = Number(productScore.value);
      const video = Number(videoScore.value);
      if (![product, video].every(n => Number.isInteger(n) && n >= 0 && n <= 20)) {
        alert('A pontuação do produto e do vídeo tem de estar entre 0 e 20. Sim, os dois.');
        return;
      }
      const ref = doc(db, VOTES_COLLECTION, voteDocId(id, currentUser.email));
      const existing = await getDoc(ref);
      if (existing.exists()) { alert('Este email já votou neste projeto.'); return; }
      saveStatus.textContent = 'A guardar...';
      await setDoc(ref, {
        projectId: id,
        turma: project.turma,
        projectName: projectLabel(project),
        voterEmail: currentUser.email,
        voterName: currentVoter.nome || '',
        voterClass: currentVoter.turma || '',
        product,
        video,
        final: (product + video) / 2,
        createdAt: serverTimestamp()
      });
      saveStatus.textContent = 'Voto guardado.';
    });

    card.querySelector('.average strong').textContent = finalAvg.toFixed(1);
    card.querySelector('.average span').textContent = `${projectVotes.length} voto${projectVotes.length === 1 ? '' : 's'} · Produto ${productAvg.toFixed(1)} · Vídeo ${videoAvg.toFixed(1)}`;
    grid.appendChild(card);
  });
}

function exportCSV() {
  const rows = [['Turma','Grupo','Email votante','Nome votante','Turma votante','Produto pontuacao','Video pontuacao','Media voto','Data','Produto URL','Video URL']];
  projects.forEach((project, index) => {
    const { id } = statsFor(project, index);
    const projectVotes = votesForProject(id);
    if (!projectVotes.length) rows.push([project.turma, projectLabel(project), '', '', '', '', '', '', '', project.productUrl, project.videoUrl]);
    projectVotes.forEach(v => rows.push([project.turma, projectLabel(project), v.voterEmail || '', v.voterName || '', v.voterClass || '', v.product, v.video, ((Number(v.product) + Number(v.video)) / 2).toFixed(2), v.createdAtText || '', project.productUrl, project.videoUrl]));
  });
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'votos-projetos-aib-firebase.csv';
  a.click();
}

filter.addEventListener('change', renderProjects);
loginButton.addEventListener('click', async () => {
  try { await signInWithPopup(auth, provider); }
  catch (error) {
    console.error(error);
    setAuthMessage('Não foi possível iniciar sessão. Confirma o Google provider no Firebase Authentication.', 'error');
  }
});
logoutButton.addEventListener('click', () => signOut(auth));
document.querySelector('#exportVotes').addEventListener('click', exportCSV);
document.querySelector('#exportVotesTop').addEventListener('click', exportCSV);
document.querySelector('#refreshData').addEventListener('click', () => { renderProjects(); updateRanking(); });

onAuthStateChanged(auth, user => {
  if (user) setSignedIn(user);
  else setSignedOut();
});

renderProjects();
updateRanking();
