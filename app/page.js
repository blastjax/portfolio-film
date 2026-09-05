'use client';

import { useEffect, useRef, useState } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month] = match;
  return month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : year;
}

function MonthOptions() {
  return (
    <>
      <option value="">Month</option>
      {MONTH_NAMES.map((name, i) => (
        <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
      ))}
    </>
  );
}

// Small "stacked photos" icon used to mark a gallery card as a group.
function GroupIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="14" height="14" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function groupCover(group) {
  return group.photos.find((p) => p.id === group.cover_photo_id) || group.photos[0];
}

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [groupView, setGroupView] = useState(null);

  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editMonth, setEditMonth] = useState('');
  const [editStatus, setEditStatus] = useState({ text: '', type: '' });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadPreviews, setUploadPreviews] = useState([]);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadYear, setUploadYear] = useState('');
  const [uploadMonth, setUploadMonth] = useState('');
  const [uploadStatus, setUploadStatus] = useState({ text: '', type: '' });
  const [uploading, setUploading] = useState(false);

  const lightboxRef = useRef(null);
  const lightboxImgRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragStateRef = useRef(null);
  const pendingZoomAnchorRef = useRef(null);

  async function loadGallery() {
    const res = await fetch('/api/photos');
    const data = await res.json();
    setItems(data);
    // Keep an open group view in sync with the fresh data (title/date/cover
    // edits reflected, or the group closed out if it no longer exists —
    // e.g. its last photo was just deleted).
    setGroupView((prev) => {
      if (!prev) return prev;
      return data.find((it) => it.type === 'group' && it.id === prev.id) || null;
    });
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAdmin(!!data.loggedIn);
    } catch {
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    loadGallery().finally(() => setLoaded(true));
    checkAuth();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      // Close whichever layer is on top first: lightbox, then the group
      // view underneath it, then the upload modal.
      if (lightboxPhoto) { closeLightbox(); return; }
      if (groupView) { closeGroupView(); return; }
      closeUploadModal();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxPhoto, groupView]);

  // ---- Auth ------------------------------------------------------------

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    setIsAdmin(false);
    closeUploadModal();
    closeLightbox();
    closeGroupView();
  }

  // ---- Groups ------------------------------------------------------------

  function openGroup(group) {
    setGroupView(group);
  }

  function closeGroupView() {
    setGroupView(null);
  }

  async function handleSetCover(photoId) {
    if (!groupView) return;
    try {
      const res = await fetch(`/api/groups/${groupView.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_photo_id: photoId }),
      });
      if (res.status === 401) {
        alert('Your session expired. Please log in again.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to set cover.');
      setGroupView((prev) => (prev ? { ...prev, cover_photo_id: photoId } : prev));
      loadGallery();
    } catch (err) {
      alert(err.message);
    }
  }

  // ---- Lightbox ----------------------------------------------------------

  function openLightbox(photo) {
    setLightboxPhoto(photo);
    setZoomed(false);
    setEditing(false);
  }

  function closeLightbox() {
    setLightboxPhoto(null);
    setZoomed(false);
    setEditing(false);
  }

  // Zoom in centered on wherever you click; while zoomed, press-and-drag
  // pans around instead — only a click that didn't move toggles zoom off,
  // so panning near the edge doesn't accidentally zoom back out.
  const DRAG_THRESHOLD_PX = 4;

  function handleImagePointerDown(e) {
    e.preventDefault();
    const container = lightboxRef.current;
    const img = lightboxImgRef.current;
    if (!container || !img) return;
    img.setPointerCapture(e.pointerId);

    const rect = img.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      moved: false,
      clickFracX: (e.clientX - rect.left) / rect.width,
      clickFracY: (e.clientY - rect.top) / rect.height,
    };
  }

  function handleImagePointerMove(e) {
    const state = dragStateRef.current;
    const container = lightboxRef.current;
    if (!state || !container) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) state.moved = true;

    if (zoomed && state.moved) {
      container.scrollLeft = state.scrollLeft - dx;
      container.scrollTop = state.scrollTop - dy;
    }
  }

  function handleImagePointerUp() {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    if (!state || state.moved) return; // a drag/pan, not a click — leave zoom as-is

    if (zoomed) {
      setZoomed(false);
    } else {
      pendingZoomAnchorRef.current = { fracX: state.clickFracX, fracY: state.clickFracY };
      setZoomed(true);
    }
  }

  // Applies the click-anchored scroll position once the image has actually
  // grown to full size, and resets scroll when zooming/closing out.
  useEffect(() => {
    const container = lightboxRef.current;
    if (!container) return;

    if (zoomed) {
      const anchor = pendingZoomAnchorRef.current;
      pendingZoomAnchorRef.current = null;
      requestAnimationFrame(() => {
        const img = lightboxImgRef.current;
        if (!anchor || !img || !container) return;
        container.scrollLeft = Math.max(0, img.offsetLeft + anchor.fracX * img.naturalWidth - container.clientWidth / 2);
        container.scrollTop = Math.max(0, img.offsetTop + anchor.fracY * img.naturalHeight - container.clientHeight / 2);
      });
    } else {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
  }, [zoomed]);

  async function handleDelete() {
    if (!lightboxPhoto) return;
    if (!confirm('Delete this photo permanently?')) return;
    const res = await fetch(`/api/photos/${lightboxPhoto.id}`, { method: 'DELETE' });
    if (res.status === 401) {
      alert('Your session expired. Please log in again.');
      return;
    }
    closeLightbox();
    loadGallery();
  }

  // ---- Edit ------------------------------------------------------------

  function enterEditMode() {
    if (!lightboxPhoto) return;
    setEditTitle(lightboxPhoto.title);
    const match = /^(\d{4})(?:-(\d{2}))?$/.exec(lightboxPhoto.photo_date || '');
    setEditYear(match ? match[1] : '');
    setEditMonth(match && match[2] ? match[2] : '');
    setEditStatus({ text: '', type: '' });
    setEditing(true);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!lightboxPhoto) return;

    const title = editTitle.trim();
    const year = editYear.trim();
    const month = editMonth;

    if (month && !year) {
      setEditStatus({ text: 'Enter a year along with the month.', type: 'error' });
      return;
    }

    const photoDate = year ? (month ? `${year}-${month}` : year) : '';

    try {
      const res = await fetch(`/api/photos/${lightboxPhoto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, photo_date: photoDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');

      const updated = { ...lightboxPhoto, title, photo_date: photoDate || null };
      setLightboxPhoto(updated);
      setEditing(false);
      loadGallery();
    } catch (err) {
      setEditStatus({ text: err.message, type: 'error' });
    }
  }

  // ---- Upload -----------------------------------------------------------

  function openUploadModal() {
    setUploadFiles([]);
    setUploadPreviews([]);
    setUploadTitle('');
    setUploadYear('');
    setUploadMonth('');
    setUploadStatus({ text: '', type: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadOpen(true);
  }

  function closeUploadModal() {
    setUploadOpen(false);
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    setUploadFiles(files);
    setUploadPreviews(files.map((file) => URL.createObjectURL(file)));
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    setUploading(true);
    setUploadStatus({
      text: uploadFiles.length > 1 ? `Uploading ${uploadFiles.length} photos…` : 'Uploading & processing…',
      type: '',
    });

    try {
      const year = uploadYear.trim();
      const month = uploadMonth;
      if (month && !year) throw new Error('Enter a year along with the month.');

      const formData = new FormData();
      for (const file of uploadFiles) formData.append('photo', file);
      formData.set('title', uploadTitle);
      formData.set('photo_date', year ? (month ? `${year}-${month}` : year) : '');

      const res = await fetch('/api/photos', { method: 'POST', body: formData });
      if (res.status === 401) throw new Error('Your session expired. Please log in again.');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setUploadStatus({ text: 'Uploaded!', type: 'success' });
      await loadGallery();
      setTimeout(closeUploadModal, 500);
    } catch (err) {
      setUploadStatus({ text: err.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <h1>
          <a href="https://www.instagram.com/_luiprime/" target="_blank" rel="noopener noreferrer">
            _luiprime portfolio
          </a>
        </h1>
        <div className="header-actions">
          <button className={`btn${isAdmin ? '' : ' hidden'}`} onClick={handleLogout}>Log out</button>
          <button className={`btn btn-primary${isAdmin ? '' : ' hidden'}`} onClick={openUploadModal}>
            + Upload photo
          </button>
        </div>
      </header>

      <main>
        {loaded && (
          <section className={`empty${items.length > 0 ? ' hidden' : ''}`}>
            <p>No photos yet.</p>
          </section>
        )}
        <div className="gallery">
          {items.map((item) => {
            if (item.type === 'group') {
              const cover = groupCover(item);
              return (
                <div key={`group-${item.id}`} className="gallery-item is-group">
                  <div className="stack-layer stack-layer-2" aria-hidden="true" />
                  <div className="stack-layer stack-layer-1" aria-hidden="true" />
                  <div className="card" onClick={() => openGroup(item)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" src={`/api/photos/${cover.id}/thumb`} alt={cover.title} />
                    <span className="group-badge"><GroupIcon /> {item.photos.length}</span>
                    <div className="meta">
                      <span className="title">{cover.title}</span>
                      <span className="date">{formatDate(cover.photo_date)}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={`photo-${item.id}`} className="gallery-item">
                <div className="card" onClick={() => openLightbox(item)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={`/api/photos/${item.id}/thumb`} alt={item.title} />
                  <div className="meta">
                    <span className="title">{item.title}</span>
                    <span className="date">{formatDate(item.photo_date)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Upload dialog */}
      <div className={`modal${uploadOpen ? '' : ' hidden'}`} onClick={(e) => { if (e.target === e.currentTarget) closeUploadModal(); }}>
        <div className="modal-card">
          <button className="modal-close" aria-label="Close" onClick={closeUploadModal}>&times;</button>
          <h2>Upload photo</h2>
          <form onSubmit={handleUploadSubmit}>
            <label className="field">
              <span>Photo file(s)</span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple required onChange={handleFileChange} />
            </label>
            {uploadFiles.length > 1 && (
              <p className="field-hint">{uploadFiles.length} photos selected — they’ll be grouped together as one card.</p>
            )}
            {uploadPreviews.length === 1 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="file-preview" src={uploadPreviews[0]} alt="Selected preview" />
            )}
            {uploadPreviews.length > 1 && (
              <div className="upload-previews">
                {uploadPreviews.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} className="file-preview" src={src} alt={`Selected preview ${i + 1}`} />
                ))}
              </div>
            )}

            <label className="field">
              <span>Title</span>
              <input
                type="text"
                placeholder="Golden hour, Big Sur"
                required
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Date taken (optional)</span>
              <div className="date-fields">
                <select aria-label="Month" value={uploadMonth} onChange={(e) => setUploadMonth(e.target.value)}>
                  <MonthOptions />
                </select>
                <input
                  type="number"
                  aria-label="Year"
                  placeholder="Year"
                  min="1826"
                  max="2100"
                  step="1"
                  value={uploadYear}
                  onChange={(e) => setUploadYear(e.target.value)}
                />
              </div>
            </label>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={uploading}>Upload</button>
              <span className={`status${uploadStatus.type ? ' ' + uploadStatus.type : ''}`}>{uploadStatus.text}</span>
            </div>
          </form>
        </div>
      </div>

      {/* Group view: all photos in a group, pick which one is the cover */}
      <div className={`modal group-modal${groupView ? '' : ' hidden'}`} onClick={(e) => { if (e.target === e.currentTarget) closeGroupView(); }}>
        <div className="modal-card group-modal-card">
          <button className="modal-close" aria-label="Close" onClick={closeGroupView}>&times;</button>
          {groupView && (
            <>
              <h2>{groupView.photos.length} photos</h2>
              <div className="group-grid">
                {groupView.photos.map((photo) => (
                  <div key={photo.id} className={`group-thumb${photo.id === groupView.cover_photo_id ? ' is-cover' : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" src={`/api/photos/${photo.id}/thumb`} alt={photo.title} onClick={() => openLightbox(photo)} />
                    {photo.id === groupView.cover_photo_id ? (
                      <span className="cover-badge">Cover</span>
                    ) : isAdmin && (
                      <button
                        type="button"
                        className="set-cover-btn"
                        onClick={(e) => { e.stopPropagation(); handleSetCover(photo.id); }}
                      >
                        Set as cover
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <div
        ref={lightboxRef}
        className={`lightbox${lightboxPhoto ? '' : ' hidden'}${zoomed ? ' zoomed' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
      >
        <div className="lightbox-toolbar">
          <button className={`btn${isAdmin ? '' : ' hidden'}`} onClick={enterEditMode}>Edit</button>
          <button className={`btn${isAdmin ? '' : ' hidden'}`} onClick={handleDelete}>Delete</button>
          <button className="lightbox-close" aria-label="Close" onClick={closeLightbox}>&times;</button>
        </div>

        {lightboxPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={lightboxImgRef}
            className={zoomed ? 'zoomed' : ''}
            src={`/api/photos/${lightboxPhoto.id}/full`}
            alt={lightboxPhoto.title}
            title={zoomed ? 'Drag to pan, click to zoom out' : 'Click to zoom in'}
            draggable={false}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
          />
        )}

        {lightboxPhoto && (
          <div className={`lightbox-caption${editing ? ' hidden' : ''}`}>
            <span id="lightboxTitle">{lightboxPhoto.title}</span>
            <span>{formatDate(lightboxPhoto.photo_date)}</span>
          </div>
        )}

        {lightboxPhoto && (
          <form className={`edit-form${editing ? '' : ' hidden'}`} onSubmit={handleEditSubmit}>
            <input
              type="text"
              className="edit-title-input"
              placeholder="Title"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <div className="date-fields edit-date-fields">
              <select aria-label="Month" value={editMonth} onChange={(e) => setEditMonth(e.target.value)}>
                <MonthOptions />
              </select>
              <input
                type="number"
                aria-label="Year"
                placeholder="Year"
                min="1826"
                max="2100"
                step="1"
                value={editYear}
                onChange={(e) => setEditYear(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <span className={`status${editStatus.type ? ' ' + editStatus.type : ''}`}>{editStatus.text}</span>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
