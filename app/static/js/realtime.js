/**
 * FileShare - Realtime Updates & Live Expiry Countdowns
 * Keeps the shared files list and public clipboard in sync across devices
 * via Server-Sent Events, and runs live countdown timers that count down
 * to zero every second until items are deleted.
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

    function updateCountdowns() {
        var cards = document.querySelectorAll('.file-card[data-created-at], .clip-card[data-created-at]');
        var now = getNow();

        cards.forEach(function (card) {
            var createdAtStr = card.getAttribute('data-created-at');
            var expirySec = parseInt(card.getAttribute('data-expiry-seconds'), 10) || 300;
            if (!createdAtStr) return;

            var createdAt = new Date(createdAtStr).getTime();
            if (isNaN(createdAt)) return;

            var expiresAt = createdAt + expirySec * 1000;
            var remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

            var display = card.querySelector('.countdown-display');
            var badge = card.querySelector('.file-countdown, .clip-countdown');

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

            if (remainingSeconds <= 0 && !card.dataset.expiring) {
                card.dataset.expiring = 'true';
                card.classList.add('card-expiring');
                setTimeout(function () {
                    var parent = card.parentElement;
                    card.remove();
                    if (parent) {
                        if (parent.id === 'filesGrid') {
                            syncVisibility(parent, document.getElementById('emptyState'));
                        } else if (parent.id === 'clipboardList') {
                            syncVisibility(parent, document.getElementById('clipboardEmptyState'));
                        }
                    }
                }, 600);
            }
        });
    }

    // Cards are rendered server-side using the *submitter's* session, so any
    // embedded CSRF token only matches their session. Swap it for this
    // browser's own token (published in the page's <meta> tag) so actions
    // like Delete work for every viewer, not just the one who submitted.
    function rebindCsrfToken(card) {
        var csrfInput = card && card.querySelector('input[name="csrf_token"]');
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (csrfInput && meta) {
            csrfInput.value = meta.content;
        }
    }

    function initFileUpdates(source) {
        var grid = document.getElementById('filesGrid');
        var emptyState = document.getElementById('emptyState');
        if (!grid || !emptyState) {
            return;
        }

        source.addEventListener('file-added', function (event) {
            var payload = JSON.parse(event.data);
            if (document.getElementById('file-card-' + payload.id)) {
                return;
            }
            grid.insertAdjacentHTML('afterbegin', payload.html);
            var newCard = document.getElementById('file-card-' + payload.id);
            rebindCsrfToken(newCard);
            updateCountdowns();
            syncVisibility(grid, emptyState);
        });

        source.addEventListener('file-removed', function (event) {
            var payload = JSON.parse(event.data);
            var card = document.getElementById('file-card-' + payload.id);
            if (card) {
                card.remove();
            }
            syncVisibility(grid, emptyState);
        });
    }

    function initClipboardUpdates(source) {
        var list = document.getElementById('clipboardList');
        var emptyState = document.getElementById('clipboardEmptyState');
        if (!list || !emptyState) {
            return;
        }

        source.addEventListener('clip-added', function (event) {
            var payload = JSON.parse(event.data);
            if (document.getElementById('clip-card-' + payload.id)) {
                return;
            }
            list.insertAdjacentHTML('afterbegin', payload.html);
            var newCard = document.getElementById('clip-card-' + payload.id);
            rebindCsrfToken(newCard);
            updateCountdowns();
            syncVisibility(list, emptyState);
        });

        source.addEventListener('clip-removed', function (event) {
            var payload = JSON.parse(event.data);
            var card = document.getElementById('clip-card-' + payload.id);
            if (card) {
                card.remove();
            }
            syncVisibility(list, emptyState);
        });

        // Copy-to-clipboard, delegated so it also covers cards inserted live.
        list.addEventListener('click', function (event) {
            var button = event.target.closest('.clip-copy');
            if (!button) {
                return;
            }
            var card = button.closest('.clip-card');
            var content = card && card.querySelector('.clip-content');
            if (!content) {
                return;
            }
            copyText(content.textContent).then(function () {
                var originalText = button.textContent;
                button.classList.add('copied');
                button.textContent = 'Copied!';
                setTimeout(function () {
                    button.classList.remove('copied');
                    button.textContent = originalText;
                }, 1500);
            });
        });
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

        if (typeof EventSource === 'undefined') {
            return;
        }

        var streamUrl = '/events/stream?visitor_id=' + encodeURIComponent(getVisitorId())
            + '&name=' + encodeURIComponent(getDisplayName());
        var source = new EventSource(streamUrl);
        initFileUpdates(source);
        initClipboardUpdates(source);
        initPresenceSidebar(source);
        // EventSource reconnects automatically on drop/error; nothing to do here.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRealtimeUpdates);
    } else {
        initRealtimeUpdates();
    }
})();
