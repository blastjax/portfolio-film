const gallery = document.getElementById('gallery');
const emptyMsg = document.getElementById('empty');

const headerLogoutBtn = document.getElementById('logoutBtn');
const openUploadBtn = document.getElementById('openUpload');

const uploadModal = document.getElementById('uploadModal');
const closeUploadBtn = document.getElementById('closeUpload');
const uploadForm = document.getElementById('uploadForm');
const uploadStatus = document.getElementById('uploadStatus');
const submitBtn = document.getElementById('submitBtn');
const photoInput = document.getElementById('photoInput');
const filePreview = document.getElementById('filePreview');
const monthInput = document.getElementById('monthInput');
const yearInput = document.getElementById('yearInput');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function populateMonthSelect(select) {
  select.innerHTML = '<option value="">Month</option>' + MONTH_NAMES.map((name, i) => {
    const value = String(i + 1).padStart(2, '0');
    return `<option value="${value}">${name}</option>`;
  }).join('');
}
populateMonthSelect(monthInput);

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxTitle = document.getElementById('lightboxTitle');
const lightboxDate = document.getElementById('lightboxDate');
const closeLightboxBtn = document.getElementById('closeLightbox');
const deletePhotoBtn = document.getElementById('deletePhoto');
const editPhotoBtn = document.getElementById('editPhoto');

const captionView = document.getElementById('captionView');
const editForm = document.getElementById('editForm');
const editTitleInput = document.getElementById('editTitleInput');
const editMonthInput = document.getElementById('editMonthInput');
const editYearInput = document.getElementById('editYearInput');
const editStatus = document.getElementById('editStatus');
const cancelEditBtn = document.getElementById('cancelEdit');
populateMonthSelect(editMonthInput);

let currentPhoto = null;
let isAdmin = false;

function formatDate(dateStr) {
  if (!dateStr) return '';
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month] = match;
  return month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : year;
}

// ---- Auth ------------------------------------------------------------

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    isAdmin = !!data.loggedIn;
  } catch {
    isAdmin = false;
  }
  updateAdminUI();
}

function updateAdminUI() {
  openUploadBtn.classList.toggle('hidden', !isAdmin);
  headerLogoutBtn.classList.toggle('hidden', !isAdmin);
  editPhotoBtn.classList.toggle('hidden', !isAdmin);
  deletePhotoBtn.classList.toggle('hidden', !isAdmin);
}

headerLogoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  isAdmin = false;
  updateAdminUI();
  closeUploadModal();
  closeLightbox();
});

// ---- Gallery -----------------------------------------------------------

async function loadGallery() {
  const res = await fetch('/api/photos');
  const photos = await res.json();

  gallery.innerHTML = '';
  emptyMsg.classList.toggle('hidden', photos.length > 0);

  for (const photo of photos) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img loading="lazy" src="/api/photos/${photo.id}/thumb" alt="${escapeHtml(photo.title)}" />
      <div class="meta">
        <span class="title">${escapeHtml(photo.title)}</span>
        <span class="date">${formatDate(photo.photo_date)}</span>
      </div>
    `;
    card.addEventListener('click', () => openLightbox(photo));
    gallery.appendChild(card);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Lightbox ------------------------------------------------------------

function setZoomed(zoomed) {
  lightboxImg.classList.toggle('zoomed', zoomed);
  lightboxImg.title = zoomed ? 'Click to zoom out' : 'Click to zoom in to full size';
  lightbox.scrollTop = 0;
  lightbox.scrollLeft = 0;
}

function openLightbox(photo) {
  currentPhoto = photo;
  lightboxImg.src = `/api/photos/${photo.id}/full`;
  lightboxImg.alt = photo.title;
  lightboxTitle.textContent = photo.title;
  lightboxDate.textContent = formatDate(photo.photo_date);
  setZoomed(false);
  exitEditMode();
  updateAdminUI();
  lightbox.classList.remove('hidden');
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  currentPhoto = null;
  setZoomed(false);
  exitEditMode();
}

closeLightboxBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
lightboxImg.addEventListener('click', (e) => {
  e.stopPropagation();
  setZoomed(!lightboxImg.classList.contains('zoomed'));
});

deletePhotoBtn.addEventListener('click', async () => {
  if (!currentPhoto) return;
  if (!confirm('Delete this photo permanently?')) return;
  const res = await fetch(`/api/photos/${currentPhoto.id}`, { method: 'DELETE' });
  if (res.status === 401) { alert('Your session expired. Please log in again.'); return; }
  closeLightbox();
  loadGallery();
});

// ---- Edit ------------------------------------------------------------

function enterEditMode() {
  if (!currentPhoto) return;
  editTitleInput.value = currentPhoto.title;

  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(currentPhoto.photo_date || '');
  editYearInput.value = match ? match[1] : '';
  editMonthInput.value = match && match[2] ? match[2] : '';

  editStatus.textContent = '';
  editStatus.className = 'status';
  captionView.classList.add('hidden');
  editForm.classList.remove('hidden');
  editTitleInput.focus();
}

function exitEditMode() {
  captionView.classList.remove('hidden');
  editForm.classList.add('hidden');
}

editPhotoBtn.addEventListener('click', enterEditMode);
cancelEditBtn.addEventListener('click', exitEditMode);

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPhoto) return;

  const title = editTitleInput.value.trim();
  const year = editYearInput.value.trim();
  const month = editMonthInput.value;

  editStatus.className = 'status';
  if (month && !year) {
    editStatus.textContent = 'Enter a year along with the month.';
    editStatus.className = 'status error';
    return;
  }

  const photoDate = year ? (month ? `${year}-${month}` : year) : '';

  try {
    const res = await fetch(`/api/photos/${currentPhoto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, photo_date: photoDate }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Save failed.');

    currentPhoto = { ...currentPhoto, title, photo_date: photoDate || null };
    lightboxTitle.textContent = currentPhoto.title;
    lightboxDate.textContent = formatDate(currentPhoto.photo_date);
    lightboxImg.alt = currentPhoto.title;

    exitEditMode();
    loadGallery();
  } catch (err) {
    editStatus.textContent = err.message;
    editStatus.className = 'status error';
  }
});

// ---- Upload -----------------------------------------------------------

function openUploadModal() {
  uploadForm.reset();
  filePreview.classList.add('hidden');
  uploadStatus.textContent = '';
  uploadStatus.className = 'status';
  uploadModal.classList.remove('hidden');
}
function closeUploadModal() { uploadModal.classList.add('hidden'); }

openUploadBtn.addEventListener('click', openUploadModal);
closeUploadBtn.addEventListener('click', closeUploadModal);
uploadModal.addEventListener('click', (e) => { if (e.target === uploadModal) closeUploadModal(); });

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) { filePreview.classList.add('hidden'); return; }
  filePreview.src = URL.createObjectURL(file);
  filePreview.classList.remove('hidden');
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  uploadStatus.textContent = 'Uploading & processing…';
  uploadStatus.className = 'status';

  try {
    const year = yearInput.value.trim();
    const month = monthInput.value;
    if (month && !year) throw new Error('Enter a year along with the month.');

    const formData = new FormData(uploadForm);
    formData.set('photo_date', year ? (month ? `${year}-${month}` : year) : '');

    const res = await fetch('/api/photos', { method: 'POST', body: formData });
    if (res.status === 401) throw new Error('Your session expired. Please log in again.');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    uploadStatus.textContent = 'Uploaded!';
    uploadStatus.className = 'status success';
    await loadGallery();
    setTimeout(closeUploadModal, 500);
  } catch (err) {
    uploadStatus.textContent = err.message;
    uploadStatus.className = 'status error';
  } finally {
    submitBtn.disabled = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeLightbox(); closeUploadModal(); }
});

loadGallery();
checkAuth();
