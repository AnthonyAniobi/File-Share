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
            this.browseBtn = document.getElementById('browseFilesBtn');
            
            if (this.dropZone && this.fileInput) {
                this.init();
            }
        }

        init() {
            // Browse button click handler
            if (this.browseBtn) {
                this.browseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.fileInput.click();
                });
            }

            // File input change
            this.fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.displayFile(e.target.files[0]);
                }
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
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    // Assign the dropped files directly to the file input
                    this.fileInput.files = files;
                    
                    // Trigger change event to activate form validation
                    const event = new Event('change', { bubbles: true });
                    this.fileInput.dispatchEvent(event);
                    
                    this.displayFile(files[0]);
                }
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

    // Share panel tab switcher (File / Text)
    function initShareTabs() {
        const tabs = document.querySelectorAll('.share-tab');
        if (!tabs.length) return;

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((t) => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');

                document.querySelectorAll('.share-form').forEach((form) => {
                    form.hidden = form.id !== tab.getAttribute('data-target');
                });
            });
        });
    }

    // Smooth scroll for anchor links. Excludes [download] links: the modal's
    // Download button starts out as a href="#" placeholder before JS points
    // it at the real file URL, and a permanent preventDefault() here would
    // silently swallow every future click on it even after the href changes.
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]:not([download])').forEach(anchor => {
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

        document.querySelectorAll('.board-card, .card').forEach(el => {
            observer.observe(el);
        });
    }

    // Initialize on DOM ready
    function init() {
        // Initialize drag and drop if the share panel is present
        if (document.getElementById('dropZone')) {
            new DragDropUpload('dropZone', 'fileInput');
        }

        // Initialize the share panel's File/Text tab switcher
        initShareTabs();

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
