/**
 * FileShare - Realtime Updates
 * Keeps the shared files list and public clipboard in sync across devices
 * via Server-Sent Events, without requiring a page refresh.
 */

(function () {
    'use strict';

    function syncVisibility(list, emptyState) {
        var hasItems = list.children.length > 0;
        list.style.display = hasItems ? '' : 'none';
        emptyState.style.display = hasItems ? 'none' : '';
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
            rebindCsrfToken(document.getElementById('file-card-' + payload.id));
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
            rebindCsrfToken(document.getElementById('clip-card-' + payload.id));
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
