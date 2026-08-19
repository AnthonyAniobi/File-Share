/**
 * FileShare - Realtime Updates & Live Expiry Countdowns
 * Keeps the shared files list and public clipboard in sync across devices
 * via Server-Sent Events, and runs live countdown timers that count down
 * to zero every second until items are deleted.
 */

(function () {
    'use strict';

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

        if (typeof EventSource === 'undefined') {
            return;
        }

        var source = new EventSource('/events/stream');
        initFileUpdates(source);
        initClipboardUpdates(source);
        // EventSource reconnects automatically on drop/error; nothing to do here.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRealtimeUpdates);
    } else {
        initRealtimeUpdates();
    }
})();
