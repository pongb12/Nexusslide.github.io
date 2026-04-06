// script.js - Nexus Shop Multi-Campaign

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// DOM elements
const loginCard = document.getElementById('loginCard');
const appContent = document.getElementById('appContent');
const homeView = document.getElementById('homeView');
const campaignDetailView = document.getElementById('campaignDetailView');
const campaignsListDiv = document.getElementById('campaignsList');
const campaignDetailCard = document.getElementById('campaignDetailCard');
const adminPanel = document.getElementById('adminPanel');
const adminCampaignsList = document.getElementById('adminCampaignsList');
const showAddCampaignBtn = document.getElementById('showAddCampaignBtn');
const addCampaignForm = document.getElementById('addCampaignForm');
const backToHomeBtn = document.getElementById('backToHomeBtn');
const userEmailBadge = document.getElementById('userEmailBadge');

let currentUser = null;
let currentViewingCampaign = null;
let campaignsUnsubscribe = null;

// Helper functions
function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Lấy mã code riêng của user (toàn cục)
async function getUserPaymentCode(userId) {
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();
  if (doc.exists && doc.data().paymentCode) return doc.data().paymentCode;
  const code = 'NX_' + Math.random().toString(36).substring(2, 10).toUpperCase();
  await userRef.set({ paymentCode: code, email: currentUser.email }, { merge: true });
  return code;
}

// Hiển thị danh sách campaign (trang chủ)
function renderCampaignsList(campaigns) {
  if (!campaignsListDiv) return;
  if (campaigns.length === 0) {
    campaignsListDiv.innerHTML = '<p>Chưa có bài thuyết trình nào. Hãy quay lại sau.</p>';
    return;
  }
  let html = '<div class="campaigns-grid">';
  campaigns.forEach(camp => {
    const current = camp.currentTotal || 0;
    const target = camp.target || 0;
    const percent = target > 0 ? (current / target) * 100 : 0;
    html += `
      <div class="campaign-card" data-id="${camp.id}">
        <h3>${escapeHtml(camp.name)}</h3>
        <div class="desc">${escapeHtml(camp.description || '')}</div>
        <div class="progress-bar-small"><div class="progress-fill-small" style="width: ${Math.min(100, percent)}%"></div></div>
        <div class="campaign-stats">
          <span>💰 ${current.toLocaleString()} / ${target.toLocaleString()}đ</span>
          <span>🎯 ${Math.floor(percent)}%</span>
        </div>
        <button class="secondary view-campaign-btn" data-id="${camp.id}" style="margin-top: 0.8rem; width:100%">Xem chi tiết & Đóng góp</button>
      </div>
    `;
  });
  html += '</div>';
  campaignsListDiv.innerHTML = html;
  // Gắn sự kiện
  document.querySelectorAll('.view-campaign-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCampaignDetail(btn.getAttribute('data-id'));
    });
  });
  document.querySelectorAll('.campaign-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      showCampaignDetail(card.getAttribute('data-id'));
    });
  });
}

// Hiển thị chi tiết campaign (đóng góp)
async function showCampaignDetail(campaignId) {
  const doc = await db.collection('campaigns').doc(campaignId).get();
  if (!doc.exists) return showToast('Không tìm thấy campaign', true);
  const camp = { id: doc.id, ...doc.data() };
  currentViewingCampaign = camp;
  const userCode = await getUserPaymentCode(currentUser.uid);
  const requiredContent = `NEXUS_${camp.id}_${userCode}`;
  const currentTotal = camp.currentTotal || 0;
  const target = camp.target || 0;
  const percent = target > 0 ? (currentTotal / target) * 100 : 0;
  const isUnlocked = currentTotal >= target;

  let unlockHtml = '';
  if (isUnlocked) {
    unlockHtml = `<a href="${camp.downloadLink || '#'}" target="_blank"><button style="background: var(--success); width:100%"><i class="fas fa-download"></i> Tải slide ngay (đã đủ tiến trình)</button></a>`;
  } else {
    unlockHtml = `<div class="alert">🔒 Chưa đủ tiến trình (${currentTotal.toLocaleString()}/${target.toLocaleString()}đ). Hãy đóng góp để mở khóa cho tất cả.</div>`;
  }

  const detailHtml = `
    <h2>${escapeHtml(camp.name)}</h2>
    <p>${escapeHtml(camp.description || '')}</p>
    <div class="progress-section">
      <div class="progress-label"><span>Tiến trình gây quỹ</span><span>${currentTotal.toLocaleString()} / ${target.toLocaleString()}đ</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(100, percent)}%"></div></div>
    </div>
    ${unlockHtml}
    <div class="bank-info-detail">
      <h3><i class="fas fa-university"></i> Chuyển khoản hỗ trợ</h3>
      <p><strong>Chủ tài khoản:</strong> TRAN THANH HO</p>
      <p><strong>Ngân hàng:</strong> MB (Military Bank)</p>
      <p><strong>Số tài khoản:</strong> 6655626666 <button class="copy-btn" data-copy="6655626666"><i class="fas fa-copy"></i></button></p>
      <p><strong>Mã code cá nhân của bạn:</strong> <span id="userCodeDisplay">${userCode}</span> <button class="copy-btn" data-copy-id="userCodeDisplay"><i class="fas fa-copy"></i></button></p>
      <p><strong>Nội dung chuyển khoản BẮT BUỘC:</strong> <strong style="background:var(--border);padding:0.2rem 0.5rem;border-radius:0.5rem;">${requiredContent}</strong> <button class="copy-btn" data-copy="${requiredContent}"><i class="fas fa-copy"></i></button></p>
      <div class="alert"><i class="fas fa-info-circle"></i> Sau khi chuyển, admin sẽ xác nhận và cập nhật tiến trình trong vòng 10-20 phút. Cảm ơn bạn!</div>
    </div>
    <div class="flex">
      <button id="refreshCampaignBtn" class="secondary"><i class="fas fa-sync-alt"></i> Kiểm tra tiến trình mới</button>
      <button id="backHomeFromDetail" class="secondary"><i class="fas fa-home"></i> Về trang chủ</button>
    </div>
  `;
  campaignDetailCard.innerHTML = detailHtml;
  homeView.style.display = 'none';
  campaignDetailView.style.display = 'block';
  // Gắn sự kiện copy
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let text = btn.getAttribute('data-copy');
      if (!text && btn.getAttribute('data-copy-id')) {
        const el = document.getElementById(btn.getAttribute('data-copy-id'));
        if (el) text = el.innerText;
      }
      if (text) {
        navigator.clipboard.writeText(text);
        showToast('Đã sao chép!');
      }
    });
  });
  document.getElementById('refreshCampaignBtn')?.addEventListener('click', () => showCampaignDetail(camp.id));
  document.getElementById('backHomeFromDetail')?.addEventListener('click', () => {
    homeView.style.display = 'block';
    campaignDetailView.style.display = 'none';
    currentViewingCampaign = null;
  });
}

// Admin: hiển thị danh sách campaign kèm quản lý
async function renderAdminCampaigns() {
  const snapshot = await db.collection('campaigns').orderBy('createdAt', 'desc').get();
  if (snapshot.empty) {
    adminCampaignsList.innerHTML = '<p>Chưa có campaign nào.</p>';
    return;
  }
  let html = '';
  snapshot.forEach(doc => {
    const c = doc.data();
    html += `
      <div class="admin-campaign-item" data-id="${doc.id}">
        <div><strong>${escapeHtml(c.name)}</strong><br>Mục tiêu: ${c.target?.toLocaleString()}đ | Hiện tại: ${c.currentTotal?.toLocaleString()}đ</div>
        <div class="admin-campaign-actions">
          <button class="edit-camp-btn" data-id="${doc.id}"><i class="fas fa-edit"></i> Sửa</button>
          <button class="reset-camp-btn" data-id="${doc.id}"><i class="fas fa-undo"></i> Reset</button>
          <button class="delete-camp-btn" data-id="${doc.id}"><i class="fas fa-trash"></i> Xóa</button>
          <button class="view-pending-btn" data-id="${doc.id}"><i class="fas fa-clock"></i> Giao dịch chờ</button>
        </div>
      </div>
    `;
  });
  adminCampaignsList.innerHTML = html;
  // Gắn sự kiện
  document.querySelectorAll('.edit-camp-btn').forEach(btn => {
    btn.addEventListener('click', () => editCampaign(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.reset-camp-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Reset tiến trình về 0?')) {
        await db.collection('campaigns').doc(btn.getAttribute('data-id')).update({ currentTotal: 0 });
        showToast('Đã reset');
        renderAdminCampaigns();
        loadCampaigns();
      }
    });
  });
  document.querySelectorAll('.delete-camp-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Xóa campaign này? Mọi giao dịch liên quan vẫn còn nhưng không hiển thị nữa.')) {
        await db.collection('campaigns').doc(btn.getAttribute('data-id')).delete();
        showToast('Đã xóa');
        renderAdminCampaigns();
        loadCampaigns();
      }
    });
  });
  document.querySelectorAll('.view-pending-btn').forEach(btn => {
    btn.addEventListener('click', () => showPendingPayments(btn.getAttribute('data-id')));
  });
}

// Xem giao dịch pending của một campaign (admin)
async function showPendingPayments(campaignId) {
  const pendingSnap = await db.collection('payments').where('campaignId', '==', campaignId).where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
  if (pendingSnap.empty) {
    alert('Không có giao dịch chờ xác nhận cho campaign này.');
    return;
  }
  let msg = 'Danh sách giao dịch chờ:\n';
  pendingSnap.forEach(doc => {
    const p = doc.data();
    msg += `- ${p.email} | ${p.amount?.toLocaleString()}đ | Mã: ${p.paymentCode} | ND: ${p.transferContent}\n`;
  });
  const action = confirm(msg + '\n\nBấm OK để xác nhận TẤT CẢ giao dịch này? (Bạn nên xác nhận từng cái thủ công hơn, nhưng đơn giản hóa)');
  if (action) {
    for (const doc of pendingSnap.docs) {
      const p = doc.data();
      await db.collection('payments').doc(doc.id).update({ status: 'confirmed', confirmedAt: new Date() });
      const campRef = db.collection('campaigns').doc(campaignId);
      const campDoc = await campRef.get();
      const current = campDoc.exists ? campDoc.data().currentTotal || 0 : 0;
      await campRef.update({ currentTotal: current + p.amount });
    }
    showToast('Đã xác nhận tất cả giao dịch và cập nhật tiến trình');
    renderAdminCampaigns();
    loadCampaigns();
    if (currentViewingCampaign && currentViewingCampaign.id === campaignId) {
      showCampaignDetail(campaignId);
    }
  }
}

// Sửa campaign (admin)
async function editCampaign(campId) {
  const doc = await db.collection('campaigns').doc(campId).get();
  if (!doc.exists) return;
  const camp = doc.data();
  const newName = prompt('Tên mới:', camp.name);
  if (newName) await db.collection('campaigns').doc(campId).update({ name: newName });
  const newTarget = parseInt(prompt('Mục tiêu mới (VNĐ):', camp.target));
  if (!isNaN(newTarget) && newTarget > 0) await db.collection('campaigns').doc(campId).update({ target: newTarget });
  const newLink = prompt('Link tải mới:', camp.downloadLink);
  if (newLink) await db.collection('campaigns').doc(campId).update({ downloadLink: newLink });
  const newDesc = prompt('Mô tả mới:', camp.description || '');
  await db.collection('campaigns').doc(campId).update({ description: newDesc });
  showToast('Đã cập nhật');
  renderAdminCampaigns();
  loadCampaigns();
  if (currentViewingCampaign && currentViewingCampaign.id === campId) showCampaignDetail(campId);
}

// Load danh sách campaign realtime
function loadCampaigns() {
  if (campaignsUnsubscribe) campaignsUnsubscribe();
  campaignsUnsubscribe = db.collection('campaigns').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    const campaigns = [];
    snapshot.forEach(doc => campaigns.push({ id: doc.id, ...doc.data() }));
    renderCampaignsList(campaigns);
    if (currentViewingCampaign) {
      showCampaignDetail(currentViewingCampaign.id);
    }
  });
}

// Thêm campaign mới (admin)
async function addNewCampaign(name, desc, target, link) {
  if (!name || target <= 0) return showToast('Tên và mục tiêu hợp lệ', true);
  await db.collection('campaigns').add({
    name, description: desc, target: parseInt(target), currentTotal: 0, downloadLink: link, createdAt: new Date()
  });
  showToast('Đã thêm campaign');
  addCampaignForm.style.display = 'none';
  renderAdminCampaigns();
  loadCampaigns();
}

// Admin thêm giao dịch thủ công (khi user chuyển khoản, admin tạo pending)
function addManualPaymentUI() {
  const adminCard = document.querySelector('#adminPanel .card');
  if (!adminCard || document.getElementById('manualPaymentSection')) return;
  const div = document.createElement('div');
  div.id = 'manualPaymentSection';
  div.style.marginTop = '1rem';
  div.style.paddingTop = '1rem';
  div.style.borderTop = '1px solid var(--border)';
  div.innerHTML = `
    <h4>Thêm giao dịch thủ công</h4>
    <input type="email" id="manualEmail" placeholder="Email người chuyển">
    <input type="number" id="manualAmount" placeholder="Số tiền (VNĐ)">
    <input type="text" id="manualCode" placeholder="Mã code của user (tùy ý)">
    <select id="manualCampaignId">
      <option value="">Chọn campaign</option>
    </select>
    <button id="manualAddPaymentBtn" class="secondary">Thêm vào danh sách chờ</button>
  `;
  adminCard.appendChild(div);
  // Load danh sách campaign vào select
  db.collection('campaigns').get().then(snap => {
    const select = document.getElementById('manualCampaignId');
    snap.forEach(doc => {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = doc.data().name;
      select.appendChild(option);
    });
  });
  document.getElementById('manualAddPaymentBtn').addEventListener('click', async () => {
    const email = document.getElementById('manualEmail').value;
    const amount = parseInt(document.getElementById('manualAmount').value);
    const code = document.getElementById('manualCode').value;
    const campaignId = document.getElementById('manualCampaignId').value;
    if (!email || isNaN(amount) || amount <= 0 || !campaignId) return showToast('Nhập đủ thông tin', true);
    // Tìm hoặc tạo user
    let userId = null;
    const userQuery = await db.collection('users').where('email', '==', email).get();
    if (!userQuery.empty) {
      userId = userQuery.docs[0].id;
    } else {
      const newUserRef = db.collection('users').doc();
      await newUserRef.set({ email, paymentCode: code || 'MANUAL_' + Date.now() });
      userId = newUserRef.id;
    }
    await db.collection('payments').add({
      campaignId, userId, email, amount, paymentCode: code, transferContent: `NEXUS_${campaignId}_${code}`,
      status: 'pending', createdAt: new Date()
    });
    showToast('Đã thêm giao dịch chờ xác nhận');
    document.getElementById('manualEmail').value = '';
    document.getElementById('manualAmount').value = '';
    document.getElementById('manualCode').value = '';
  });
}

// Auth state
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (user) {
    loginCard.style.display = 'none';
    appContent.style.display = 'block';
    userEmailBadge.innerText = user.email;
    loadCampaigns();
    if (user.email === 'st163943@gmail.com') {
      adminPanel.style.display = 'block';
      renderAdminCampaigns();
      addManualPaymentUI();
      db.collection('campaigns').onSnapshot(() => renderAdminCampaigns());
    } else {
      adminPanel.style.display = 'none';
    }
    homeView.style.display = 'block';
    campaignDetailView.style.display = 'none';
  } else {
    loginCard.style.display = 'block';
    appContent.style.display = 'none';
    if (campaignsUnsubscribe) campaignsUnsubscribe();
  }
});

// Event listeners
document.getElementById('loginBtn').onclick = () => {
  const email = document.getElementById('loginEmail').value;
  const pwd = document.getElementById('loginPassword').value;
  auth.signInWithEmailAndPassword(email, pwd).catch(e => showToast(e.message, true));
};
document.getElementById('registerBtn').onclick = () => {
  const email = document.getElementById('loginEmail').value;
  const pwd = document.getElementById('loginPassword').value;
  auth.createUserWithEmailAndPassword(email, pwd).then(() => showToast('Đăng ký thành công, hãy đăng nhập')).catch(e => showToast(e.message, true));
};
document.getElementById('logoutBtn').onclick = () => auth.signOut();
backToHomeBtn.onclick = () => {
  homeView.style.display = 'block';
  campaignDetailView.style.display = 'none';
  currentViewingCampaign = null;
};
showAddCampaignBtn.onclick = () => addCampaignForm.style.display = 'block';
document.getElementById('cancelAddCampaignBtn').onclick = () => addCampaignForm.style.display = 'none';
document.getElementById('confirmAddCampaignBtn').onclick = () => {
  const name = document.getElementById('newCampName').value;
  const desc = document.getElementById('newCampDesc').value;
  const target = document.getElementById('newCampTarget').value;
  const link = document.getElementById('newCampLink').value;
  addNewCampaign(name, desc, target, link);
};

// Theme
const themeToggle = document.getElementById('themeToggle');
const themeText = document.getElementById('themeText');
function setTheme(theme) {
  if (theme === 'dark') document.body.classList.add('dark');
  else document.body.classList.remove('dark');
  localStorage.setItem('theme', theme);
  themeText.innerText = theme === 'dark' ? 'Tối' : 'Sáng';
}
setTheme(localStorage.getItem('theme') || 'light');
themeToggle.onclick = () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');