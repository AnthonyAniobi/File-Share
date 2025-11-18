/**
 * FileShare - Main JavaScript
 * Handles drag-and-drop and interactive features
 */

(function() {
    'use strict';

    // Drag and Drop Handler
    class DragDropUpload {
        constructor(dropZoneId, fileInputId) {
            this.dropZone = document.getElementById(dropZoneId);
            this.fileInput = document.getElementById(fileInputId);
            this.filePreview = document.getElementById('filePreview');
            this.filePreviewName = document.getElementById('filePreviewName');
            this.filePreviewSize = document.getElementById('filePreviewSize');
            
            if (this.dropZone && this.fileInput) {
                this.init();
            }
        }

        init() {
            // Click to browse
            this.dropZone.addEventListener('click', (e) => {
                if (e.target !== this.fileInput && !e.target.classList.contains('file-preview-remove')) {
                    this.fileInput.click();
                }
            });

            // File input change
            this.fileInput.addEventListener('change', (e) => {
                this.handleFiles(e.target.files);
            });

            // Drag events
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                this.dropZone.addEventListener(eventName, this.preventDefaults, false);
                document.body.addEventListener(eventName, this.preventDefaults, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                this.dropZone.addEventListener(eventName, () => {
                    this.dropZone.classList.add('drag-over');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                this.dropZone.addEventListener(eventName, () => {
                    this.dropZone.classList.remove('drag-over');
                }, false);
            });

            this.dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                this.handleFiles(files);
            }, false);

            // Remove file button
            const removeBtn = document.getElementById('removeFileBtn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.clearFile();
                });
            }
        }

        preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        handleFiles(files) {
            if (files.length > 0) {
                const file = files[0];
                this.displayFile(file);
            }
        }

        displayFile(file) {
            // Show file preview
            if (this.filePreview) {
                this.filePreview.classList.add('active');
                this.dropZone.classList.add('has-file');
                
                if (this.filePreviewName) {
                    this.filePreviewName.textContent = file.name;
                }
                
                if (this.filePreviewSize) {
                    this.filePreviewSize.textContent = this.formatFileSize(file.size);
                }

                // Hide the drop zone content
                const dropZoneContent = document.getElementById('dropZoneContent');
                if (dropZoneContent) {
                    dropZoneContent.style.display = 'none';
                }
            }
        }

        clearFile() {
            this.fileInput.value = '';
            
            if (this.filePreview) {
                this.filePreview.classList.remove('active');
                this.dropZone.classList.remove('has-file');
            }

            // Show the drop zone content
            const dropZoneContent = document.getElementById('dropZoneContent');
            if (dropZoneContent) {
                dropZoneContent.style.display = 'block';
            }
        }

        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
        }
    }

    // Smooth scroll for anchor links
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // Fade in animations
    function initFadeInAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        document.querySelectorAll('.file-card, .card').forEach(el => {
            observer.observe(el);
        });
    }

    // Initialize on DOM ready
    function init() {
        // Initialize drag and drop if on share page
        if (document.getElementById('dropZone')) {
            new DragDropUpload('dropZone', 'fileInput');
        }

        // Initialize smooth scroll
        initSmoothScroll();

        // Initialize fade in animations
        initFadeInAnimations();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
