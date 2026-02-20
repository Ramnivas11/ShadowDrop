/* ═══════════════════════════════════════════
   ShadowDrop — Client-Side Logic
   ═══════════════════════════════════════════ */

(() => {
    'use strict';

    // ─── DOM refs ────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const tabsNav = $('.tabs-nav');
    const tabs = $$('.tab-btn');
    const panels = $$('.panel');

    const textInput = $('#textInput');
    const charCount = $('#charCount');
    const btnShareText = $('#btnShareText');

    const dropzone = $('#dropzone');
    const fileInput = $('#fileInput');
    const fileInfo = $('#fileInfo');
    const fileNameEl = $('#fileName');
    const fileSizeEl = $('#fileSize');
    const btnClearFile = $('#btnClearFile');
    const btnShareFile = $('#btnShareFile');

    const codeInput = $('#codeInput');
    const btnRetrieve = $('#btnRetrieve');

    const resultOverlay = $('#resultOverlay');
    const resultCard = $('#resultCard');
    const toastContainer = $('#toastContainer');

    let selectedFile = null;

    // ─── Tabs ────────────────────────────────
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            // Update active state
            tabs.forEach((t) => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            // Update indicator position
            tabsNav.setAttribute('data-active', tabId);

            // Show corresponding panel
            panels.forEach((p) => p.classList.remove('active'));
            const activePanel = $(`#panel-${tabId}`);
            // Small timeout to allow display block to apply before animation
            activePanel.style.display = 'block';
            requestAnimationFrame(() => {
                activePanel.classList.add('active');
                // Remove inline style to let CSS handle it
                setTimeout(() => activePanel.style.display = '', 50);
            });
        });
    });

    // ─── Character count ────────────────────
    textInput.addEventListener('input', () => {
        charCount.textContent = textInput.value.length.toLocaleString();
    });

    // ─── Dropzone ────────────────────────────
    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                handleFileSelect(fileInput.files[0]);
            }
        });
    }

    if (btnClearFile) btnClearFile.addEventListener('click', clearFile);

    function handleFileSelect(file) {
        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxSize) {
            showToast('File exceeds 10 MB limit.', 'error');
            return;
        }
        selectedFile = file;
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatBytes(file.size);
        fileInfo.classList.remove('hidden');
        dropzone.classList.add('hidden');
        btnShareFile.disabled = false;
    }

    function clearFile() {
        selectedFile = null;
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        dropzone.classList.remove('hidden');
        btnShareFile.disabled = true;
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ─── Code input ──────────────────────────
    if (codeInput) {
        codeInput.addEventListener('input', () => {
            codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
            btnRetrieve.disabled = codeInput.value.length !== 6;
        });
    }

    // ─── Share Text ──────────────────────────
    if (btnShareText) {
        btnShareText.addEventListener('click', async () => {
            const text = textInput.value.trim();
            if (!text) {
                showToast('Please enter some text.', 'error');
                textInput.focus();
                return;
            }

            setLoading(btnShareText, true);

            try {
                const res = await fetch('/api/drops/text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text }),
                });
                const data = await res.json();

                if (!res.ok) throw new Error(data.message || 'Upload failed.');

                showCodeResult(data.code);
                textInput.value = '';
                charCount.textContent = '0';
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                setLoading(btnShareText, false);
            }
        });
    }

    // ─── Share File ──────────────────────────
    if (btnShareFile) {
        btnShareFile.addEventListener('click', async () => {
            if (!selectedFile) return;

            setLoading(btnShareFile, true);

            try {
                const formData = new FormData();
                formData.append('file', selectedFile);

                const res = await fetch('/api/drops/file', {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();

                if (!res.ok) throw new Error(data.message || 'Upload failed.');

                showCodeResult(data.code);
                clearFile();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                setLoading(btnShareFile, false);
            }
        });
    }

    // ─── Retrieve ────────────────────────────
    if (btnRetrieve) {
        btnRetrieve.addEventListener('click', async () => {
            const code = codeInput.value.trim();
            if (code.length !== 6) return;

            setLoading(btnRetrieve, true);

            try {
                const res = await fetch(`/api/drops/${code}`);

                if (!res.ok) {
                    const data = await res.json();

                    // Handle brute force cooldown
                    if (res.status === 429) {
                        showCooldownToast(data.cooldownRemaining || 30);
                        throw new Error(data.message);
                    }

                    // Show remaining attempts on 404
                    if (data.attemptsRemaining !== undefined) {
                        showToast(`${data.message} (${data.attemptsRemaining} attempts left)`, 'error');
                    } else {
                        showToast(data.message || 'Drop not found.', 'error');
                    }
                    return;
                }

                const contentType = res.headers.get('Content-Type') || '';

                // If it's a file download
                if (contentType && !contentType.includes('application/json')) {
                    const blob = await res.blob();
                    const disposition = res.headers.get('Content-Disposition') || '';
                    let filename = 'download';
                    const match = disposition.match(/filename="?(.+?)"?$/);
                    if (match) filename = decodeURIComponent(match[1]);

                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);

                    showToast(`File "${filename}" downloaded!`, 'success');
                    codeInput.value = '';
                    btnRetrieve.disabled = true;
                } else {
                    // Text drop
                    const data = await res.json();
                    showTextResult(data.content);
                    codeInput.value = '';
                    btnRetrieve.disabled = true;
                }
            } catch (err) {
                if (err.message) showToast(err.message, 'error');
            } finally {
                setLoading(btnRetrieve, false);
            }
        });
    }

    // ─── Cooldown toast with live countdown ──
    function showCooldownToast(seconds) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.innerHTML = `
            <div class="toast-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <span>Locked out. Retry in <strong class="mono" id="cooldownSeconds">${seconds}</strong>s</span>
        `;
        toastContainer.appendChild(toast);

        const span = toast.querySelector('#cooldownSeconds');
        let remaining = seconds;
        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                toast.classList.add('toast-out');
                toast.addEventListener('animationend', () => toast.remove());
            } else {
                span.textContent = remaining;
            }
        }, 1000);
    }

    // ─── Result overlays ────────────────────
    function showCodeResult(code) {
        resultCard.innerHTML = `
      <div class="result-icon success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
      </div>
      <h3>Drop Secured!</h3>
      <p>Share this code. It disappears entirely after <strong>first access</strong> or <strong>5 minutes</strong>.</p>
      
      <div class="clipboard-group" title="Click to copy" id="copyCodeGrp">
        <div class="result-code-large" id="copyCode">${code}</div>
        <div class="click-hint">Click to Copy</div>
      </div>

      <div class="modal-actions">
        <button class="action-btn secondary-btn" id="btnCopyCode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy</span>
        </button>
        <button class="action-btn primary-btn" id="btnDone">
          <span>Done</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
    `;

        resultOverlay.classList.remove('hidden');

        $('#btnCopyCode').addEventListener('click', () => copyToClipboard(code));
        $('#copyCodeGrp').addEventListener('click', () => copyToClipboard(code));
        $('#btnDone').addEventListener('click', closeOverlay);
        $('.overlay-backdrop').addEventListener('click', closeOverlay);
    }

    function showTextResult(text) {
        resultCard.innerHTML = `
      <div class="result-icon success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <h3>Drop Retrieved</h3>
      <p>This text has been permanently deleted from our servers.</p>
      
      <div class="retrieved-text-box mono">${escapeHtml(text)}</div>

      <div class="modal-actions">
        <button class="action-btn secondary-btn" id="btnCopyText">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy Content</span>
        </button>
        <button class="action-btn primary-btn" id="btnDoneText">
           <span>Close</span>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

        resultOverlay.classList.remove('hidden');

        $('#btnCopyText').addEventListener('click', () => copyToClipboard(text));
        $('#btnDoneText').addEventListener('click', closeOverlay);
        $('.overlay-backdrop').addEventListener('click', closeOverlay);
    }

    function closeOverlay() {
        resultOverlay.classList.add('hidden');
    }

    // ─── Helpers ─────────────────────────────
    function setLoading(btn, loading) {
        btn.classList.toggle('loading', loading);
        btn.disabled = loading;
        if (loading) {
            btn.dataset.originalContent = btn.innerHTML;
            btn.innerHTML = '<div class="loading-spinner"></div><span>Processing</span>';
        } else if (btn.dataset.originalContent) {
            btn.innerHTML = btn.dataset.originalContent;
        }
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
        } catch {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast('Copied to clipboard!', 'success');
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let iconHtml = '';
        if (type === 'success') {
            iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
        } else if (type === 'error') {
            iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
        } else {
            iconHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
        }

        toast.innerHTML = `
            <div class="toast-icon">
                ${iconHtml}
            </div>
            <span>${escapeHtml(message)}</span>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3500);
    }

    // Set initial active state on load
    document.addEventListener('DOMContentLoaded', () => {
        tabsNav.setAttribute('data-active', 'text');
    });
})();
