/**
 * FileShare - Realtime Updates
 * Keeps the shared files list in sync across devices via Server-Sent Events,
 * without requiring a page refresh.
 */

(function () {
    'use strict';

    function initRealtimeUpdates() {
        var grid = document.getElementById('filesGrid');
        var emptyState = document.getElementById('emptyState');
        if (!grid || !emptyState || typeof EventSource === 'undefined') {
            return;
        }

        function syncEmptyState() {
            var hasFiles = grid.children.length > 0;
            grid.style.display = hasFiles ? '' : 'none';
            emptyState.style.display = hasFiles ? 'none' : '';
        }

        function handleFileAdded(event) {
            var payload = JSON.parse(event.data);
            if (document.getElementById('file-card-' + payload.id)) {
                return;
            }

            grid.insertAdjacentHTML('afterbegin', payload.html);

            // The card's CSRF token was rendered for the uploader's own
            // session; swap it for this browser's own token so the Delete
            // button works here too.
            var card = document.getElementById('file-card-' + payload.id);
            var csrfInput = card && card.querySelector('input[name="csrf_token"]');
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (csrfInput && meta) {
                csrfInput.value = meta.content;
            }

            syncEmptyState();
        }

        function handleFileRemoved(event) {
            var payload = JSON.parse(event.data);
            var card = document.getElementById('file-card-' + payload.id);
            if (card) {
                card.remove();
            }
            syncEmptyState();
        }

        var source = new EventSource('/events/stream');
        source.addEventListener('file-added', handleFileAdded);
        source.addEventListener('file-removed', handleFileRemoved);
        // EventSource reconnects automatically on drop/error; nothing to do here.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRealtimeUpdates);
    } else {
        initRealtimeUpdates();
    }
})();
