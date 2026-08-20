/**
 * FileShare - Realtime Updates & Live Expiry Countdowns
 * Keeps the unified board (files + shared text) in sync across devices via
 * Server-Sent Events, drives the click-to-expand detail modal, and runs
 * live countdown timers that count down to zero until items are deleted.
 */

(function () {
    'use strict';

    var STORAGE_KEYS = {
        visitorId: 'fileshare_visitor_id',
        displayName: 'fileshare_display_name',
    };

    // sessionStorage is per-tab and cleared when the tab closes, which is
    // exactly the lifetime we want for the visitor id / display name. Guard
    // access in case it's unavailable (private-mode edge cases) and fall
    // back to an in-memory value for the life of the page.
    var memoryFallback = {};

    function storageGet(key) {
        try {
            return sessionStorage.getItem(key);
        } catch (err) {
            return memoryFallback[key] || null;
        }
    }

    function storageSet(key, value) {
        try {
            sessionStorage.setItem(key, value);
        } catch (err) {
            memoryFallback[key] = value;
        }
    }

    function getVisitorId() {
        var id = storageGet(STORAGE_KEYS.visitorId);
        if (!id) {
            id = (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : ('visitor-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2));
            storageSet(STORAGE_KEYS.visitorId, id);
        }
        return id;
    }

    function getDisplayName() {
        return storageGet(STORAGE_KEYS.displayName) || '';
    }

    function setDisplayName(name) {
        storageSet(STORAGE_KEYS.displayName, name);
        document.querySelectorAll('.js-sender-name').forEach(function (input) {
            input.value = name;
        });
    }

    function syncNameToServer(name) {
        var meta = document.querySelector('meta[name="csrf-token"]');
        fetch('/profile/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': meta ? meta.content : '',
            },
            body: JSON.stringify({ visitor_id: getVisitorId(), name: name }),
        }).catch(function () {
            // Best-effort: the presence sidebar just won't show the new
            // name until the next successful sync or reconnect.
        });
    }

    function initSenderNameFields() {
        setDisplayName(getDisplayName());
    }

    function initProfileBar() {
        var input = document.getElementById('displayNameInput');
        var hint = document.getElementById('profileSavedHint');
        if (!input) return;

        input.value = getDisplayName();

        var debounceTimer = null;
        var hintTimer = null;

        function showSavedHint() {
            if (!hint) return;
            hint.classList.add('visible');
            clearTimeout(hintTimer);
            hintTimer = setTimeout(function () {
                hint.classList.remove('visible');
            }, 1500);
        }

        function commit() {
            var name = input.value.trim();
            setDisplayName(name);
            syncNameToServer(name);
            showSavedHint();
        }

        input.addEventListener('input', function () {
            // Local-only updates (sessionStorage + hidden form fields) happen
            // on every keystroke; the network call to rename the presence
            // entry is debounced so we don't spam the server while typing.
            setDisplayName(input.value.trim());
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(commit, 500);
        });

        input.addEventListener('blur', function () {
            clearTimeout(debounceTimer);
            commit();
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                clearTimeout(debounceTimer);
                commit();
                input.blur();
            }
        });
    }

    function initPresenceSidebar(source) {
        var list = document.getElementById('onlineList');
        var countEl = document.getElementById('onlineCount');
        var toggle = document.getElementById('onlineToggle');
        var sidebar = document.getElementById('onlineSidebar');
        var overlay = document.getElementById('onlineOverlay');
        var closeBtn = document.getElementById('onlineClose');
        if (!list || !countEl) return;

        var selfId = getVisitorId();

        function labelFor(visitor) {
            return visitor.id === selfId ? visitor.name + ' (You)' : visitor.name;
        }

        function renderItem(visitor) {
            var li = document.createElement('li');
            li.className = 'online-item' + (visitor.id === selfId ? ' online-item-self' : '');
            li.setAttribute('data-visitor-id', visitor.id);
            var dot = document.createElement('span');
            dot.className = 'online-dot';
            var name = document.createElement('span');
            name.className = 'online-name';
            name.textContent = labelFor(visitor);
            li.appendChild(dot);
            li.appendChild(name);
            return li;
        }

        function updateCount() {
            countEl.textContent = list.children.length;
        }

        function upsert(visitor) {
            var existing = list.querySelector('[data-visitor-id="' + visitor.id + '"]');
            if (existing) {
                existing.querySelector('.online-name').textContent = labelFor(visitor);
            } else {
                list.appendChild(renderItem(visitor));
            }
            updateCount();
        }

        function removeById(id) {
            var existing = list.querySelector('[data-visitor-id="' + id + '"]');
            if (existing) {
                existing.remove();
            }
            updateCount();
        }

        source.addEventListener('presence-sync', function (event) {
            var visitors = JSON.parse(event.data);
            list.innerHTML = '';
            visitors.forEach(upsert);
            updateCount();
        });

        source.addEventListener('presence-added', function (event) {
            upsert(JSON.parse(event.data));
        });

        source.addEventListener('presence-renamed', function (event) {
            upsert(JSON.parse(event.data));
        });

        source.addEventListener('presence-removed', function (event) {
            removeById(JSON.parse(event.data).id);
        });

        if (toggle && sidebar) {
            function openSidebar() {
                sidebar.classList.add('open');
                sidebar.setAttribute('aria-hidden', 'false');
                toggle.setAttribute('aria-expanded', 'true');
                if (overlay) overlay.hidden = false;
            }

            function closeSidebar() {
                sidebar.classList.remove('open');
                sidebar.setAttribute('aria-hidden', 'true');
                toggle.setAttribute('aria-expanded', 'false');
                if (overlay) overlay.hidden = true;
            }

            toggle.addEventListener('click', function () {
                if (sidebar.classList.contains('open')) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });

            if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
            if (overlay) overlay.addEventListener('click', closeSidebar);
        }
    }

    var serverTimeOffset = 0;
    var serverTimeMeta = document.querySelector('meta[name="server-time"]');
    if (serverTimeMeta && serverTimeMeta.content) {
        var parsedServerTime = new Date(serverTimeMeta.content).getTime();
        if (!isNaN(parsedServerTime)) {
            serverTimeOffset = parsedServerTime - Date.now();
        }
    }

    function getNow() {
        return Date.now() + serverTimeOffset;
    }

    function syncVisibility(list, emptyState) {
        if (!list || !emptyState) return;
        var hasItems = list.children.length > 0;
        list.style.display = hasItems ? '' : 'none';
        emptyState.style.display = hasItems ? 'none' : '';
        var countEl = document.getElementById('boardCount');
        if (countEl) countEl.textContent = list.children.length;
    }

    function formatFullTime(iso) {
        var date = new Date(iso);
        if (isNaN(date.getTime())) return '';
        try {
            return date.toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            });
        } catch (err) {
            return date.toString();
        }
    }

    function formatRemaining(totalSeconds) {
        if (totalSeconds <= 0) {
            return 'Expiring...';
        }
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        if (hours > 0) {
            return hours + 'h ' + minutes + 'm ' + (seconds < 10 ? '0' : '') + seconds + 's';
        }
        if (minutes > 0) {
            return minutes + 'm ' + (seconds < 10 ? '0' : '') + seconds + 's';
        }
        return seconds + 's';
    }

    function applyCountdown(createdAtStr, expirySec, display, badge) {
        if (!createdAtStr) return null;
        var createdAt = new Date(createdAtStr).getTime();
        if (isNaN(createdAt)) return null;

        var expiresAt = createdAt + (expirySec || 300) * 1000;
        var remainingSeconds = Math.max(0, Math.floor((expiresAt - getNow()) / 1000));

        if (display) {
            display.textContent = formatRemaining(remainingSeconds);
        }

        if (badge) {
            if (remainingSeconds <= 0) {
                badge.classList.remove('countdown-warning', 'countdown-urgent');
                badge.classList.add('countdown-expired');
            } else if (remainingSeconds <= 15) {
                badge.classList.remove('countdown-warning');
                badge.classList.add('countdown-urgent');
            } else if (remainingSeconds <= 60) {
                badge.classList.remove('countdown-urgent');
                badge.classList.add('countdown-warning');
            } else {
                badge.classList.remove('countdown-warning', 'countdown-urgent', 'countdown-expired');
            }
        }

        return remainingSeconds;
    }

    function updateCountdowns() {
        var board = document.getElementById('board');
        var boardEmptyState = document.getElementById('boardEmptyState');
        var cards = document.querySelectorAll('.board-card[data-created-at]');

        cards.forEach(function (card) {
            var remainingSeconds = applyCountdown(
                card.getAttribute('data-created-at'),
                parseInt(card.getAttribute('data-expiry-seconds'), 10),
                card.querySelector('.countdown-display'),
                card.querySelector('.board-card-countdown')
            );
            if (remainingSeconds === null) return;

            if (remainingSeconds <= 0 && !card.dataset.expiring) {
                card.dataset.expiring = 'true';
                card.classList.add('card-expiring');
                setTimeout(function () {
                    card.remove();
                    syncVisibility(board, boardEmptyState);
                }, 600);
            }
        });

        // Keep an open detail modal's countdown ticking too.
        var modalOverlay = document.getElementById('boardModalOverlay');
        if (modalOverlay && !modalOverlay.hidden) {
            applyCountdown(
                modalOverlay.dataset.createdAt,
                parseInt(modalOverlay.dataset.expirySeconds, 10),
                document.querySelector('#boardModalCountdown .countdown-display'),
                document.getElementById('boardModalCountdown')
            );
        }
    }

    function initBoardUpdates(source) {
        var board = document.getElementById('board');
        var emptyState = document.getElementById('boardEmptyState');
        if (!board || !emptyState) {
            return;
        }

        function handleAdded(kind) {
            return function (event) {
                var payload = JSON.parse(event.data);
                if (document.getElementById('board-item-' + kind + '-' + payload.id)) {
                    return;
                }
                board.insertAdjacentHTML('afterbegin', payload.html);
                updateCountdowns();
                syncVisibility(board, emptyState);
            };
        }

        function handleRemoved(kind) {
            return function (event) {
                var payload = JSON.parse(event.data);
                var card = document.getElementById('board-item-' + kind + '-' + payload.id);
                if (card) {
                    card.remove();
                }
                closeModalIfShowing(kind, payload.id);
                syncVisibility(board, emptyState);
            };
        }

        source.addEventListener('file-added', handleAdded('file'));
        source.addEventListener('file-removed', handleRemoved('file'));
        source.addEventListener('clip-added', handleAdded('clip'));
        source.addEventListener('clip-removed', handleRemoved('clip'));

        // Clicking anywhere on a card (except its own removal, handled
        // above) opens the shared detail modal.
        board.addEventListener('click', function (event) {
            var card = event.target.closest('.board-card');
            if (card) {
                openBoardModal(card);
            }
        });

        syncVisibility(board, emptyState);
    }

    function closeModalIfShowing(kind, id) {
        var overlay = document.getElementById('boardModalOverlay');
        if (overlay && !overlay.hidden && overlay.dataset.kind === kind && overlay.dataset.id === String(id)) {
            closeBoardModal();
        }
    }

    function openBoardModal(card) {
        var overlay = document.getElementById('boardModalOverlay');
        if (!overlay) return;

        var kind = card.dataset.kind;
        var isFile = kind === 'file';

        overlay.dataset.kind = kind;
        overlay.dataset.id = card.dataset.id;
        overlay.dataset.createdAt = card.dataset.createdAt;
        overlay.dataset.expirySeconds = card.dataset.expirySeconds;

        document.getElementById('boardModalTitle').textContent = isFile ? card.dataset.filename : 'Shared text';
        document.getElementById('boardModalSender').textContent = card.dataset.sender;
        document.getElementById('boardModalTime').textContent = formatFullTime(card.dataset.createdAt);

        var contentEl = document.getElementById('boardModalContent');
        var downloadEl = document.getElementById('boardModalDownload');
        var copyEl = document.getElementById('boardModalCopy');

        if (isFile) {
            contentEl.hidden = true;
            downloadEl.hidden = false;
            downloadEl.href = card.dataset.downloadUrl;
            copyEl.hidden = true;
        } else {
            contentEl.hidden = false;
            contentEl.textContent = card.dataset.content;
            downloadEl.hidden = true;
            copyEl.hidden = false;
        }

        var deleteForm = document.getElementById('boardModalDeleteForm');
        deleteForm.action = card.dataset.deleteUrl;
        // Always use *this* viewer's own CSRF token — cards carry no forms
        // of their own, so there's nothing stale to worry about here.
        var csrfInput = deleteForm.querySelector('input[name="csrf_token"]');
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (csrfInput && meta) {
            csrfInput.value = meta.content;
        }
        deleteForm.onsubmit = function () {
            return confirm(isFile ? 'Delete this file for everyone?' : 'Remove this text for everyone?');
        };

        updateCountdowns();

        overlay.hidden = false;
        document.body.classList.add('board-modal-open');
    }

    function closeBoardModal() {
        var overlay = document.getElementById('boardModalOverlay');
        if (!overlay) return;
        overlay.hidden = true;
        document.body.classList.remove('board-modal-open');
    }

    function initBoardModal() {
        var overlay = document.getElementById('boardModalOverlay');
        var closeBtn = document.getElementById('boardModalClose');
        var copyEl = document.getElementById('boardModalCopy');
        if (!overlay) return;

        if (closeBtn) closeBtn.addEventListener('click', closeBoardModal);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeBoardModal();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !overlay.hidden) closeBoardModal();
        });

        var copyLabel = document.getElementById('boardModalCopyLabel');
        if (copyEl && copyLabel) {
            copyEl.addEventListener('click', function () {
                var content = document.getElementById('boardModalContent');
                if (!content) return;
                copyText(content.textContent).then(function () {
                    var originalText = copyLabel.textContent;
                    copyEl.classList.add('copied');
                    copyLabel.textContent = 'Copied!';
                    setTimeout(function () {
                        copyEl.classList.remove('copied');
                        copyLabel.textContent = originalText;
                    }, 1500);
                });
            });
        }
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }

        // navigator.clipboard requires a secure context (HTTPS or
        // localhost); this app is plain HTTP on the LAN, so fall back to
        // the legacy selection-based copy for other devices.
        return new Promise(function (resolve, reject) {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                var successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                successful ? resolve() : reject(new Error('execCommand failed'));
            } catch (err) {
                document.body.removeChild(textarea);
                reject(err);
            }
        });
    }

    function initRealtimeUpdates() {
        updateCountdowns();
        setInterval(updateCountdowns, 1000);

        initSenderNameFields();
        initProfileBar();
        initBoardModal();

        if (typeof EventSource === 'undefined') {
            return;
        }

        var streamUrl = '/events/stream?visitor_id=' + encodeURIComponent(getVisitorId())
            + '&name=' + encodeURIComponent(getDisplayName());
        var source = new EventSource(streamUrl);
        initBoardUpdates(source);
        initPresenceSidebar(source);
        // EventSource reconnects automatically on drop/error; nothing to do here.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRealtimeUpdates);
    } else {
        initRealtimeUpdates();
    }
})();
