firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

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
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchSuggestions = document.getElementById('searchSuggestions');
const helpBtn = document.getElementById('helpBtn');
const modal = document.getElementById('helpModal');
const deviceModal = document.getElementById('deviceModal');
const showDeviceInfoBtn = document.getElementById('showDeviceInfoBtn');
const displayHwid = document.getElementById('displayHwid');
const displayIp = document.getElementById('displayIp');

let currentUser = null;
let currentViewingCampaign = null;
let campaignsUnsubscribe = null;
let allCampaigns = [];
let discordWebhookUrl = '';
let currentHwid = '';
let currentIp = '';

function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fas ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${msg}`;
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

async function getDeviceInfo() {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    currentHwid = result.visitorId;
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipRes.json();
    currentIp = ipData.ip;
  } catch (e) { console.error(e); }
}

async function addLog(action, details = {}) {
  if (!currentUser) return;
  try {
    await db.collection('logs').add({
      userId: currentUser.uid,
      email: currentUser.email,
      action: action,
      details: details,
      hwid: currentHwid,
      ip: currentIp,
      timestamp: new Date()
    });
  } catch (e) { console.error('Log error:', e); }
}

async function getUserPaymentCode(userId) {
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();
  if (doc.exists && doc.data().paymentCode) return doc.data().paymentCode;
  const code = 'NX_' + Math.random().toString(36).substring(2, 10).toUpperCase();
  await userRef.set({ paymentCode: code, email: currentUser.email, hwid: currentHwid, ip: currentIp }, { merge: true });
  return code;
}

async function loadDiscordWebhook() {
  if (!currentUser || currentUser.email !== 'st163943@gmail.com') return;
  const configRef = db.collection('adminConfig').doc('settings');
  const doc = await configRef.get();
  if (doc.exists && doc.data().discordWebhook) {
    discordWebhookUrl = doc.data().discordWebhook;
    document.getElementById('discordWebhookUrl').value = discordWebhookUrl;
  }
}

async function saveDiscordWebhook(url) {
  if (!currentUser || currentUser.email !== 'st163943@gmail.com') return;
  const configRef = db.collection('adminConfig').doc('settings');
  await configRef.set({ discordWebhook: url }, { merge: true });
  discordWebhookUrl = url;
  showToast('Đã lưu webhook vào server!');
  addLog('save_discord_webhook', { url });
}

async function sendDiscordNotification(content) {
  if (!discordWebhookUrl) return;
  try {
    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    });
  } catch (e) { console.error(e); }
}

function filterCampaigns(keyword) {
  if (!keyword.trim()) return allCampaigns.filter(c => c.status !== 'completed');
  const lower = keyword.toLowerCase();
  return allCampaigns.filter(c => (c.status !== 'completed') && (c.name.toLowerCase().includes(lower) || (c.description && c.description.toLowerCase().includes(lower))));
}

function renderSuggestions(keyword) {
  if (!keyword.trim()) {
    searchSuggestions.style.display = 'none';
    return;
  }
  const filtered = filterCampaigns(keyword);
  if (filtered.length === 0) {
    searchSuggestions.style.display = 'none';
    return;
  }
  let html = '';
  filtered.slice(0, 5).forEach(c => {
    html += `<div class="suggestion-item" data-id="${c.id}">${escapeHtml(c.name)}</div>`;
  });
  searchSuggestions.innerHTML = html;
  searchSuggestions.style.display = 'block';
  document.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      searchInput.value = el.innerText;
      searchSuggestions.style.display = 'none';
      renderCampaignsList(filterCampaigns(searchInput.value));
    });
  });
}

function renderCampaignsList(campaigns) {
  if (!campaignsListDiv) return;
  if (campaigns.length === 0) {
    campaignsListDiv.innerHTML = '<p>✨ Không tìm thấy bài thuyết trình nào.</p>';
    return;
  }
  let html = '<div class="campaigns-grid">';
  campaigns.forEach(camp => {
    const current = camp.currentTotal || 0;
    const target = camp.target || 0;
    const percent = target > 0 ? (current / target) * 100 : 0;
    html += `
      <div class="campaign-card" data-id="${camp.id}">
        <h3><i class="fas fa-file-powerpoint"></i> ${escapeHtml(camp.name)}</h3>
        <div class="desc">${escapeHtml(camp.description || '')}</div>
        <div class="progress-bar-small"><div class="progress-fill-small" style="width: ${Math.min(100, percent)}%"></div></div>
        <div class="campaign-stats">
          <span>💰 ${current.toLocaleString()} / ${target.toLocaleString()}đ</span>
          <span>🎯 ${Math.floor(percent)}%</span>
        </div>
        <button class="secondary view-campaign-btn" data-id="${camp.id}" style="margin-top: 0.8rem; width:100%"><i class="fas fa-eye"></i> Xem chi tiết</button>
      </div>
    `;
  });
  html += '</div>';
  campaignsListDiv.innerHTML = html;
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
    unlockHtml = `<div class="alert"><i class="fas fa-lock"></i> Chưa đủ tiến trình (${currentTotal.toLocaleString()}/${target.toLocaleString()}đ). Hãy đóng góp để mở khóa cho tất cả.</div>`;
  }
  const qrImageUrl = "https://cdn.discordapp.com/attachments/1352301017353425000/1490740479162056885/IMG_3760.jpg?ex=69d527c2&is=69d3d642&hm=6bb9d6c180eac58426a2d9591149176488041a6f065248786d311497582d7e3b";
  const detailHtml = `
    <h2><i class="fas fa-chalkboard"></i> ${escapeHtml(camp.name)}</h2>
    <p>${escapeHtml(camp.description || '')}</p>
    <div class="progress-section">
      <div class="progress-label"><span><i class="fas fa-chart-simple"></i> Tiến trình gây quỹ</span><span>${currentTotal.toLocaleString()} / ${target.toLocaleString()}đ</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(100, percent)}%"></div></div>
    </div>
    ${unlockHtml}
    <div class="bank-info-detail">
      <h3><i class="fas fa-building-columns"></i> Chuyển khoản hỗ trợ</h3>
      <p><strong>Chủ tài khoản:</strong> TRẦN THÁI SƠN</p>
      <p><strong>Ví nhận:</strong> MoMo</p>
      <p><strong>Số tài khoản:</strong> 0915956805 <button class="copy-btn" data-copy="0915956805"><i class="fas fa-copy"></i></button></p>
      <div class="qr-code">
        <img src="${qrImageUrl}" alt="QR MoMo" class="qr-code-img" onerror="this.src='https://via.placeholder.com/200?text=QR+MoMo'">
        <p><i class="fas fa-qrcode"></i> Quét mã QR để chuyển nhanh</p>
      </div>
      <p><strong><i class="fas fa-fingerprint"></i> Mã code của bạn:</strong> <span id="userCodeDisplay">${userCode}</span> <button class="copy-btn" data-copy-id="userCodeDisplay"><i class="fas fa-copy"></i></button></p>
      <p><strong><i class="fas fa-pen"></i> Nội dung chuyển khoản BẮT BUỘC:</strong> <strong class="highlight">${requiredContent}</strong> <button class="copy-btn" data-copy="${requiredContent}"><i class="fas fa-copy"></i></button></p>
      <div class="alert"><i class="fas fa-clock"></i> Sau khi chuyển, bấm nút bên dưới để báo admin. Admin sẽ xác nhận và cập nhật tiến trình sớm nhất.</div>
      <button id="notifyPaidBtn" class="secondary" style="margin-top:0.5rem; width:100%"><i class="fas fa-bell"></i> Tôi đã chuyển khoản, xác nhận giúp</button>
    </div>
    <div class="flex">
      <button id="refreshCampaignBtn" class="secondary"><i class="fas fa-rotate-right"></i> Kiểm tra tiến trình mới</button>
      <button id="backHomeFromDetail" class="secondary"><i class="fas fa-home"></i> Về trang chủ</button>
    </div>
  `;
  campaignDetailCard.innerHTML = detailHtml;
  homeView.style.display = 'none';
  campaignDetailView.style.display = 'block';
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
  document.getElementById('notifyPaidBtn')?.addEventListener('click', async () => {
    try {
      const response = await fetch(PIPEDREAM_NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: camp.id,
          userId: currentUser.uid,
          email: currentUser.email,
          paymentCode: userCode,
          transferContent: requiredContent,
          hwid: currentHwid,
          ip: currentIp
        })
      });
      if (response.ok) {
        showToast('Đã gửi yêu cầu xác nhận! Admin sẽ cập nhật sớm.');
        addLog('notify_payment', { campaignId: camp.id, amount: 0 });
      } else {
        throw new Error('Lỗi từ server');
      }
    } catch (err) {
      showToast('Lỗi gửi yêu cầu: ' + err.message, true);
    }
  });
  document.getElementById('refreshCampaignBtn')?.addEventListener('click', () => showCampaignDetail(camp.id));
  document.getElementById('backHomeFromDetail')?.addEventListener('click', () => {
    homeView.style.display = 'block';
    campaignDetailView.style.display = 'none';
    currentViewingCampaign = null;
  });
  addLog('view_campaign_detail', { campaignId: camp.id });
}

async function renderAdminCampaigns() {
  const snapshot = await db.collection('campaigns').orderBy('createdAt', 'desc').get();
  if (snapshot.empty) {
    adminCampaignsList.innerHTML = '<p>Chưa có campaign nào.</p>';
    return;
  }
  let activeHtml = '<h4><i class="fas fa-play-circle"></i> Đang hoạt động</h4>';
  let completedHtml = '<h4><i class="fas fa-check-circle"></i> Đã hoàn thành</h4>';
  let hasActive = false, hasCompleted = false;
  snapshot.forEach(doc => {
    const c = doc.data();
    const isCompleted = c.status === 'completed';
    const itemHtml = `
      <div class="admin-campaign-item" data-id="${doc.id}">
        <div><strong>${escapeHtml(c.name)}</strong><br>🎯 Mục tiêu: ${c.target?.toLocaleString()}đ | 💰 Hiện tại: ${c.currentTotal?.toLocaleString()}đ</div>
        <div class="admin-campaign-actions">
          <button class="edit-camp-btn" data-id="${doc.id}"><i class="fas fa-pen"></i> Sửa</button>
          <button class="reset-camp-btn" data-id="${doc.id}"><i class="fas fa-undo"></i> Reset</button>
          <button class="delete-camp-btn" data-id="${doc.id}"><i class="fas fa-trash"></i> Xóa</button>
          <button class="view-pending-btn" data-id="${doc.id}"><i class="fas fa-clock"></i> Giao dịch chờ</button>
          ${!isCompleted ? '<button class="complete-camp-btn" data-id="'+doc.id+'"><i class="fas fa-check-double"></i> Đánh dấu hoàn thành</button>' : '<button class="reactivate-camp-btn" data-id="'+doc.id+'"><i class="fas fa-undo-alt"></i> Kích hoạt lại</button>'}
        </div>
      </div>
    `;
    if (isCompleted) {
      completedHtml += itemHtml;
      hasCompleted = true;
    } else {
      activeHtml += itemHtml;
      hasActive = true;
    }
  });
  if (!hasActive) activeHtml += '<p>Không có campaign đang hoạt động.</p>';
  if (!hasCompleted) completedHtml += '<p>Chưa có campaign hoàn thành.</p>';
  adminCampaignsList.innerHTML = activeHtml + '<hr>' + completedHtml;
  document.querySelectorAll('.edit-camp-btn').forEach(btn => btn.addEventListener('click', () => editCampaign(btn.getAttribute('data-id'))));
  document.querySelectorAll('.reset-camp-btn').forEach(btn => btn.addEventListener('click', async () => {
    if (confirm('Reset tiến trình về 0?')) {
      await db.collection('campaigns').doc(btn.getAttribute('data-id')).update({ currentTotal: 0 });
      showToast('Đã reset');
      renderAdminCampaigns();
      loadCampaigns();
      addLog('reset_campaign', { campaignId: btn.getAttribute('data-id') });
    }
  }));
  document.querySelectorAll('.delete-camp-btn').forEach(btn => btn.addEventListener('click', async () => {
    if (confirm('Xóa campaign này?')) {
      await db.collection('campaigns').doc(btn.getAttribute('data-id')).delete();
      showToast('Đã xóa');
      renderAdminCampaigns();
      loadCampaigns();
      addLog('delete_campaign', { campaignId: btn.getAttribute('data-id') });
    }
  }));
  document.querySelectorAll('.view-pending-btn').forEach(btn => btn.addEventListener('click', () => showPendingPayments(btn.getAttribute('data-id'))));
  document.querySelectorAll('.complete-camp-btn').forEach(btn => btn.addEventListener('click', async () => {
    if (confirm('Đánh dấu campaign này là đã hoàn thành? Nó sẽ không hiển thị trên trang chủ.')) {
      await db.collection('campaigns').doc(btn.getAttribute('data-id')).update({ status: 'completed' });
      showToast('Đã chuyển sang trạng thái hoàn thành');
      renderAdminCampaigns();
      loadCampaigns();
      addLog('complete_campaign', { campaignId: btn.getAttribute('data-id') });
    }
  }));
  document.querySelectorAll('.reactivate-camp-btn').forEach(btn => btn.addEventListener('click', async () => {
    if (confirm('Kích hoạt lại campaign này? Nó sẽ xuất hiện trên trang chủ.')) {
      await db.collection('campaigns').doc(btn.getAttribute('data-id')).update({ status: 'active' });
      showToast('Đã kích hoạt lại');
      renderAdminCampaigns();
      loadCampaigns();
      addLog('reactivate_campaign', { campaignId: btn.getAttribute('data-id') });
    }
  }));
}

async function showPendingPayments(campaignId) {
  const pendingSnap = await db.collection('payments').where('campaignId', '==', campaignId).where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
  if (pendingSnap.empty) {
    alert('Không có giao dịch chờ xác nhận.');
    return;
  }
  let msg = 'Danh sách giao dịch chờ (bấm OK để xác nhận tất cả):\n';
  pendingSnap.forEach(doc => {
    const p = doc.data();
    msg += `- ${p.email} | Số tiền: ${p.amount ? p.amount.toLocaleString() : '?'}đ | Mã: ${p.paymentCode}\n`;
  });
  if (confirm(msg)) {
    for (const doc of pendingSnap.docs) {
      const p = doc.data();
      let amount = p.amount;
      if (!amount || amount === 0) {
        amount = parseInt(prompt(`Nhập số tiền user ${p.email} đã chuyển:`, '0'));
        if (isNaN(amount) || amount <= 0) continue;
      }
      await db.collection('payments').doc(doc.id).update({ status: 'confirmed', confirmedAt: new Date(), amount });
      const campRef = db.collection('campaigns').doc(campaignId);
      const campDoc = await campRef.get();
      const current = campDoc.exists ? campDoc.data().currentTotal || 0 : 0;
      await campRef.update({ currentTotal: current + amount });
      showToast(`✅ Xác nhận +${amount.toLocaleString()}đ từ ${p.email}`);
      addLog('confirm_payment', { campaignId, userId: p.userId, amount });
    }
    renderAdminCampaigns();
    loadCampaigns();
    if (currentViewingCampaign && currentViewingCampaign.id === campaignId) showCampaignDetail(campaignId);
  }
}

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
  addLog('edit_campaign', { campaignId: campId });
}

function loadCampaigns() {
  if (campaignsUnsubscribe) campaignsUnsubscribe();
  campaignsUnsubscribe = db.collection('campaigns').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allCampaigns = [];
    snapshot.forEach(doc => allCampaigns.push({ id: doc.id, ...doc.data() }));
    const keyword = searchInput.value;
    const filtered = filterCampaigns(keyword);
    renderCampaignsList(filtered);
    if (currentViewingCampaign) showCampaignDetail(currentViewingCampaign.id);
    const skeleton = document.querySelector('.skeleton-card');
    if (skeleton) skeleton.remove();
  });
}

async function addNewCampaign(name, desc, target, link) {
  if (!name || target <= 0) return showToast('Tên và mục tiêu hợp lệ', true);
  await db.collection('campaigns').add({
    name, description: desc, target: parseInt(target), currentTotal: 0, downloadLink: link, createdAt: new Date(), status: 'active'
  });
  showToast('✅ Đã thêm campaign');
  addCampaignForm.style.display = 'none';
  renderAdminCampaigns();
  loadCampaigns();
  addLog('add_campaign', { name, target });
}

function addManualPaymentUI() {
  const adminCard = document.querySelector('#adminPanel .card');
  if (!adminCard || document.getElementById('manualPaymentSection')) return;
  const div = document.createElement('div');
  div.id = 'manualPaymentSection';
  div.style.marginTop = '1rem';
  div.style.paddingTop = '1rem';
  div.style.borderTop = '1px solid var(--border)';
  div.innerHTML = `
    <h4><i class="fas fa-hand-holding-usd"></i> Thêm giao dịch thủ công</h4>
    <input type="email" id="manualEmail" placeholder="Email người chuyển">
    <input type="number" id="manualAmount" placeholder="Số tiền (VNĐ)">
    <input type="text" id="manualCode" placeholder="Mã code (nếu có)">
    <select id="manualCampaignId"><option value="">Chọn campaign</option></select>
    <label><input type="checkbox" id="confirmNowCheckbox"> Xác nhận ngay</label>
    <button id="manualAddPaymentBtn" class="secondary">Thêm</button>
  `;
  adminCard.appendChild(div);
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
    const email = document.getElementById('manualEmail').value.trim();
    const amount = parseInt(document.getElementById('manualAmount').value);
    const code = document.getElementById('manualCode').value.trim();
    const campaignId = document.getElementById('manualCampaignId').value;
    const confirmNow = document.getElementById('confirmNowCheckbox').checked;
    if (!email || isNaN(amount) || amount <= 0 || !campaignId) return showToast('Nhập đủ thông tin', true);
    let userId = null;
    const userQuery = await db.collection('users').where('email', '==', email).get();
    if (!userQuery.empty) {
      userId = userQuery.docs[0].id;
    } else {
      const newUserRef = db.collection('users').doc();
      await newUserRef.set({ email, paymentCode: code || 'MANUAL_' + Date.now() });
      userId = newUserRef.id;
    }
    const paymentData = {
      campaignId, userId, email, amount, paymentCode: code, transferContent: `NEXUS_${campaignId}_${code}`,
      status: confirmNow ? 'confirmed' : 'pending', createdAt: new Date()
    };
    await db.collection('payments').add(paymentData);
    if (confirmNow) {
      const campRef = db.collection('campaigns').doc(campaignId);
      const campDoc = await campRef.get();
      const current = campDoc.exists ? campDoc.data().currentTotal || 0 : 0;
      await campRef.update({ currentTotal: current + amount });
      showToast(`Đã thêm và xác nhận +${amount.toLocaleString()}đ`);
      loadCampaigns();
      if (currentViewingCampaign && currentViewingCampaign.id === campaignId) showCampaignDetail(campaignId);
    } else {
      showToast('Đã thêm giao dịch chờ xác nhận');
    }
    renderAdminCampaigns();
    addLog('manual_payment', { email, amount, campaignId });
  });
}

document.getElementById('googleSignInBtn').onclick = async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    showToast(`👋 Chào ${user.displayName || user.email}!`);
    await getDeviceInfo();
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      const code = 'NX_' + Math.random().toString(36).substring(2, 10).toUpperCase();
      await userRef.set({ paymentCode: code, email: user.email, name: user.displayName || '', hwid: currentHwid, ip: currentIp });
    } else {
      await userRef.update({ hwid: currentHwid, ip: currentIp, lastLogin: new Date() });
    }
    addLog('google_login', { email: user.email });
  } catch (error) {
    showToast('Đăng nhập Google thất bại: ' + error.message, true);
  }
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
  addNewCampaign(
    document.getElementById('newCampName').value,
    document.getElementById('newCampDesc').value,
    document.getElementById('newCampTarget').value,
    document.getElementById('newCampLink').value
  );
};

const discordInput = document.getElementById('discordWebhookUrl');
const saveDiscordBtn = document.getElementById('saveDiscordWebhookBtn');
const discordStatus = document.getElementById('discordStatus');
if (saveDiscordBtn) {
  saveDiscordBtn.onclick = async () => {
    const url = discordInput.value.trim();
    await saveDiscordWebhook(url);
    discordStatus.innerText = url ? 'Đã lưu!' : 'Đã xóa';
    setTimeout(() => discordStatus.innerText = '', 2000);
  };
}

searchInput.addEventListener('input', (e) => {
  const keyword = e.target.value;
  renderSuggestions(keyword);
  const filtered = filterCampaigns(keyword);
  renderCampaignsList(filtered);
});
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  renderSuggestions('');
  renderCampaignsList(allCampaigns.filter(c => c.status !== 'completed'));
});
document.addEventListener('click', (e) => {
  if (!searchSuggestions.contains(e.target) && e.target !== searchInput) {
    searchSuggestions.style.display = 'none';
  }
});

helpBtn.onclick = () => modal.style.display = 'block';
document.querySelector('.close').onclick = () => modal.style.display = 'none';
window.onclick = (event) => { if (event.target == modal) modal.style.display = 'none'; };

showDeviceInfoBtn.onclick = () => {
  displayHwid.innerText = currentHwid || 'Chưa xác định';
  displayIp.innerText = currentIp || 'Chưa xác định';
  deviceModal.style.display = 'block';
};
document.querySelector('.close-device').onclick = () => deviceModal.style.display = 'none';
window.onclick = (event) => { if (event.target == deviceModal) deviceModal.style.display = 'none'; };

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (user) {
    loginCard.style.display = 'none';
    appContent.style.display = 'block';
    userEmailBadge.innerText = user.email;
    await getDeviceInfo();
    loadCampaigns();
    if (user.email === 'st163943@gmail.com') {
      adminPanel.style.display = 'block';
      renderAdminCampaigns();
      addManualPaymentUI();
      await loadDiscordWebhook();
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