// Detect if BookStack's dark mode is enabled
const isDarkMode = document.documentElement.classList.contains('dark-mode');

// Initialize Mermaid.js, dynamically setting the theme based on BookStack's mode
mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: isDarkMode ? 'dark' : 'default'
});

// Zoom Level Configuration
const ZOOM_LEVEL_MIN = 0.5;
const ZOOM_LEVEL_MAX = 2.0;
const ZOOM_LEVEL_INCREMENT = 0.1;
const DEFAULT_ZOOM_SCALE = 1.0;

const DRAG_THRESHOLD_PIXELS = 3;
const ZOOM_ANIMATION_CLASS_TIMEOUT_MS = 200;

const CSS_CLASSES = {
    CONTAINER: 'mermaid-container',
    VIEWPORT: 'mermaid-viewport',
    CONTENT: 'mermaid-content',
    DIAGRAM: 'mermaid-diagram',
    CONTROLS: 'mermaid-controls',
    ZOOM_CONTROLS: 'mermaid-zoom-controls',
    INTERACTION_ENABLED: 'interaction-enabled',
    DRAGGING: 'dragging',
    ZOOMING: 'zooming',
    LOCK_ICON: 'fa fa-lock',
    UNLOCK_ICON: 'fa fa-unlock',
    INTERACTIVE_HOVER: 'interactive-hover', // Class for 'grab' cursor state
    INTERACTIVE_PAN: 'interactive-pan',     // Class for 'grabbing' cursor state
    BUTTON_BASE: 'mermaid-viewer-button-base' // Base class for all viewer buttons
};

class InteractiveMermaidViewer {
    constructor(container, mermaidCode) {
        this.container = container;
        this.mermaidCode = mermaidCode;
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        this.dragStarted = false;
        this.startX = 0;
        this.startY = 0;

        const numDecimalPlaces = (ZOOM_LEVEL_INCREMENT.toString().split('.')[1] || '').length;
        this.zoomLevels = Array.from(
            { length: Math.round((ZOOM_LEVEL_MAX - ZOOM_LEVEL_MIN) / ZOOM_LEVEL_INCREMENT) + 1 },
            (_, i) => parseFloat((ZOOM_LEVEL_MIN + i * ZOOM_LEVEL_INCREMENT).toFixed(numDecimalPlaces))
        );

        this.currentZoomIndex = this.zoomLevels.findIndex(level => Math.abs(level - DEFAULT_ZOOM_SCALE) < 1e-9);
        if (this.currentZoomIndex === -1) {
            this.currentZoomIndex = Math.floor(this.zoomLevels.length / 2);
        }
        this.interactionEnabled = false;
        this.initialContentOffset = { x: 0, y: 0 };

        // Cache DOM elements
        this.toggleInteractionBtn = null;
        this.copyCodeBtn = null;
        this.zoomInBtn = null;
        this.zoomOutBtn = null;
        this.zoomResetBtn = null;

        // Use an AbortController for robust event listener cleanup.
        this.abortController = new AbortController();

        // Bind event handlers for proper addition and removal
        this.boundMouseMoveHandler = this.handleMouseMove.bind(this);
        this.boundMouseUpHandler = this.handleMouseUp.bind(this);
        this.boundToggleInteraction = this.toggleInteraction.bind(this);
        this.boundCopyCode = this.copyCode.bind(this);
        this.boundZoomIn = this.handleZoomClick.bind(this, 1);
        this.boundZoomOut = this.handleZoomClick.bind(this, -1);
        this.boundResetZoom = this.resetZoom.bind(this);
        this.boundHandleWheel = this.handleWheel.bind(this);
        this.boundHandleMouseDown = this.handleMouseDown.bind(this);
        this.boundPreventDefault = e => e.preventDefault();
        this.boundPreventSelect = e => { if (this.isDragging || this.interactionEnabled) e.preventDefault(); };

        this.setupViewer();
        this.setupEventListeners();
    }

    /**
     * Creates the DOM structure for the viewer programmatically.
     * This is safer and more maintainable than using innerHTML with a large template string.
     */
    setupViewer() {
        const createButton = (title, iconClass, ...extraClasses) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `${CSS_CLASSES.BUTTON_BASE} ${extraClasses.join(' ')}`;
            button.title = title;
            const icon = document.createElement('i');
            icon.className = iconClass;
            icon.setAttribute('aria-hidden', 'true');
            button.append(icon);
            return button;
        };

        const controls = document.createElement('div');
        controls.className = CSS_CLASSES.CONTROLS;
        this.toggleInteractionBtn = createButton('Toggle interaction', CSS_CLASSES.LOCK_ICON, 'mermaid-btn', 'toggle-interaction');
        this.copyCodeBtn = createButton('Copy code', 'fa fa-copy', 'mermaid-btn');
        controls.append(this.toggleInteractionBtn, this.copyCodeBtn);

        const zoomControls = document.createElement('div');
        zoomControls.className = CSS_CLASSES.ZOOM_CONTROLS;
        this.zoomInBtn = createButton('Zoom in', 'fa fa-search-plus', 'mermaid-zoom-btn', 'zoom-in');
        this.zoomOutBtn = createButton('Zoom out', 'fa fa-search-minus', 'mermaid-zoom-btn', 'zoom-out');
        this.zoomResetBtn = createButton('Reset', 'fa fa-refresh', 'mermaid-zoom-btn', 'zoom-reset');
        zoomControls.append(this.zoomInBtn, this.zoomOutBtn, this.zoomResetBtn);

        this.diagram = document.createElement('div');
        this.diagram.className = CSS_CLASSES.DIAGRAM;
        // Use textContent for security, preventing any potential HTML injection.
        // Mermaid will parse the text content safely.
        this.diagram.textContent = this.mermaidCode;

        this.content = document.createElement('div');
        this.content.className = CSS_CLASSES.CONTENT;
        this.content.append(this.diagram);

        this.viewport = document.createElement('div');
        this.viewport.className = CSS_CLASSES.VIEWPORT;
        this.viewport.append(this.content);

        // Clear the container and append the new structure
        this.container.innerHTML = '';
        this.container.append(controls, zoomControls, this.viewport);

        // Function to render the diagram and perform post-render setup
        const renderAndSetup = () => {
            mermaid.run({ nodes: [this.diagram] }).then(() => {
                this.adjustContainerHeight();
                this.calculateInitialOffset();
                this.centerDiagram();
            }).catch(error => {
                console.error("Mermaid rendering error for diagram:", this.mermaidCode, error);
                // Use BookStack's negative color variable and provide a clearer message for debugging.
                this.diagram.innerHTML = `<p style="color: var(--color-neg); padding: 10px;">Error rendering diagram. Check browser console for details.</p>`;
            });
        };

        // Check if Font Awesome is loaded before rendering
        // This checks for the 'Font Awesome 6 Free' font family, which is common.
        // Adjust if your Font Awesome version uses a different family name for its core icons.
        if (document.fonts && typeof document.fonts.check === 'function' && document.fonts.check('1em "Font Awesome 6 Free"')) { // Check if Font Awesome is immediately available
            renderAndSetup();
        } else if (document.fonts && document.fonts.ready) { // Simplified check for document.fonts.ready
            document.fonts.ready.then(renderAndSetup).catch(err => {
                renderAndSetup(); // Proceed with rendering even if font check fails after timeout/error
            });
        } else {
            renderAndSetup();
        }
    }

    adjustContainerHeight() {
        const svgElement = this.content.querySelector('svg');
        if (svgElement) {
            // Ensure the viewport takes up the height of the rendered SVG
            this.viewport.style.height = '100%';
        }

        // Remove any set height on the container once the viewer has had a chance to render
        window.requestAnimationFrame(() => {
            this.container.style.removeProperty('height');
        });
    }

    calculateInitialOffset() {
        const originalTransform = this.content.style.transform;
        this.content.style.transform = '';
        const contentRect = this.content.getBoundingClientRect();
        const viewportRect = this.viewport.getBoundingClientRect();
        this.initialContentOffset.x = contentRect.left - viewportRect.left;
        this.initialContentOffset.y = contentRect.top - viewportRect.top;
        this.content.style.transform = originalTransform;
    }

    _getViewportCenterClientCoords() {
        const viewportRect = this.viewport.getBoundingClientRect();
        return {
            clientX: viewportRect.left + viewportRect.width / 2,
            clientY: viewportRect.top + viewportRect.height / 2,
        };
    }

    setupEventListeners() {
        const { signal } = this.abortController;

        this.toggleInteractionBtn.addEventListener('click', this.boundToggleInteraction, { signal });
        this.copyCodeBtn.addEventListener('click', this.boundCopyCode, { signal });
        this.zoomInBtn.addEventListener('click', this.boundZoomIn, { signal });
        this.zoomOutBtn.addEventListener('click', this.boundZoomOut, { signal });
        this.zoomResetBtn.addEventListener('click', this.boundResetZoom, { signal });

        this.viewport.addEventListener('wheel', this.boundHandleWheel, { passive: false, signal });
        this.viewport.addEventListener('mousedown', this.boundHandleMouseDown, { signal });

        // Listen on document for mousemove to handle dragging outside viewport
        document.addEventListener('mousemove', this.boundMouseMoveHandler, { signal });
        // Listen on window for mouseup to ensure drag ends even if mouse is released outside
        window.addEventListener('mouseup', this.boundMouseUpHandler, { signal, capture: true });

        this.viewport.addEventListener('contextmenu', this.boundPreventDefault, { signal });
        this.viewport.addEventListener('selectstart', this.boundPreventSelect, { signal });
    }

    toggleInteraction() {
        this.interactionEnabled = !this.interactionEnabled;
        const icon = this.toggleInteractionBtn.querySelector('i');
        this.toggleInteractionBtn.setAttribute('aria-pressed', this.interactionEnabled.toString());

        if (this.interactionEnabled) {
            icon.className = CSS_CLASSES.UNLOCK_ICON;
            this.toggleInteractionBtn.title = 'Disable manual interaction';
            this.viewport.classList.add(CSS_CLASSES.INTERACTION_ENABLED);
            this.viewport.classList.add(CSS_CLASSES.INTERACTIVE_HOVER); // Set grab cursor state
            this.viewport.classList.remove(CSS_CLASSES.INTERACTIVE_PAN); // Ensure pan cursor state is off
        } else {
            icon.className = CSS_CLASSES.LOCK_ICON;
            this.toggleInteractionBtn.title = 'Enable manual interaction';
            this.viewport.classList.remove(CSS_CLASSES.INTERACTION_ENABLED);
            this.viewport.classList.remove(CSS_CLASSES.INTERACTIVE_HOVER);
            this.viewport.classList.remove(CSS_CLASSES.INTERACTIVE_PAN);
            this.isDragging = false; // Ensure dragging stops if interaction is disabled mid-drag
            this.dragStarted = false;
            this.viewport.classList.remove(CSS_CLASSES.DRAGGING);
        }
    }

    updateTransform() {
        this.content.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    handleZoomClick(direction) {
        const { clientX, clientY } = this._getViewportCenterClientCoords();
        this.zoom(direction, clientX, clientY);
    }

    handleWheel(e) {
        if (!this.interactionEnabled) return;
        // Prevent default browser scroll/zoom behavior when wheeling over the diagram
        e.preventDefault();
        this.content.classList.add(CSS_CLASSES.ZOOMING);
        const clientX = e.clientX;
        const clientY = e.clientY;
        if (e.deltaY > 0) this.zoom(-1, clientX, clientY);
        else this.zoom(1, clientX, clientY);
        setTimeout(() => this.content.classList.remove(CSS_CLASSES.ZOOMING), ZOOM_ANIMATION_CLASS_TIMEOUT_MS);
    }

    handleMouseDown(e) {
        if (!this.interactionEnabled || e.button !== 0) return;
        e.preventDefault();
        this.isDragging = true;
        this.dragStarted = false;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.dragBaseTranslateX = this.translateX;
        this.dragBaseTranslateY = this.translateY;
        this.viewport.classList.add(CSS_CLASSES.DRAGGING);
        this.viewport.classList.remove(CSS_CLASSES.INTERACTIVE_HOVER);
        this.viewport.classList.add(CSS_CLASSES.INTERACTIVE_PAN);
        this.content.classList.remove(CSS_CLASSES.ZOOMING);
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        // e.preventDefault() is called only after dragStarted is true to allow clicks if threshold isn't met.
        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;
        if (!this.dragStarted && (Math.abs(deltaX) > DRAG_THRESHOLD_PIXELS || Math.abs(deltaY) > DRAG_THRESHOLD_PIXELS)) {
            this.dragStarted = true;
        }
        if (this.dragStarted) {
            e.preventDefault(); // Prevent text selection, etc., only when drag has truly started
            this.translateX = this.dragBaseTranslateX + deltaX;
            this.translateY = this.dragBaseTranslateY + deltaY;
            this.updateTransform();
        }
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.dragStarted = false;
            this.viewport.classList.remove(CSS_CLASSES.DRAGGING);
            this.viewport.classList.remove(CSS_CLASSES.INTERACTIVE_PAN);
            if (this.interactionEnabled) { // Revert to grab cursor if interaction is still enabled
                this.viewport.classList.add(CSS_CLASSES.INTERACTIVE_HOVER);
            }
        }
        this.content.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    centerDiagram() {
        const svgElement = this.content.querySelector('svg');
        if (svgElement) {
            const viewportRect = this.viewport.getBoundingClientRect();
            const svgIntrinsicWidth = svgElement.viewBox.baseVal.width || svgElement.clientWidth;
            const svgIntrinsicHeight = svgElement.viewBox.baseVal.height || svgElement.clientHeight;

            const targetContentLeftRelativeToViewport = (viewportRect.width - (svgIntrinsicWidth * this.scale)) / 2;
            const targetContentTopRelativeToViewport = (viewportRect.height - (svgIntrinsicHeight * this.scale)) / 2;

            this.translateX = targetContentLeftRelativeToViewport - this.initialContentOffset.x;
            this.translateY = targetContentTopRelativeToViewport - this.initialContentOffset.y;

            // Initial centering constraints; may need adjustment for very large diagrams.
            this.translateX = Math.max(0, this.translateX);
            this.translateY = Math.max(0, this.translateY);

            this.updateTransform();
        }
    }

    zoom(direction, clientX, clientY) {
        this.content.classList.add(CSS_CLASSES.ZOOMING);
        const oldScale = this.scale;
        let newZoomIndex = this.currentZoomIndex + direction;

        if (newZoomIndex >= 0 && newZoomIndex < this.zoomLevels.length) {
            this.currentZoomIndex = newZoomIndex;
            const newScale = this.zoomLevels[this.currentZoomIndex];

            const viewportRect = this.viewport.getBoundingClientRect();
            const pointXInContent = (clientX - viewportRect.left - this.translateX) / oldScale;
            const pointYInContent = (clientY - viewportRect.top - this.translateY) / oldScale;

            this.translateX = (clientX - viewportRect.left) - (pointXInContent * newScale);
            this.translateY = (clientY - viewportRect.top) - (pointYInContent * newScale);
            this.scale = newScale;
            this.updateTransform();
        }
        setTimeout(() => this.content.classList.remove(CSS_CLASSES.ZOOMING), ZOOM_ANIMATION_CLASS_TIMEOUT_MS);
    }

    resetZoom() {
        this.content.classList.add(CSS_CLASSES.ZOOMING);
        this.currentZoomIndex = this.zoomLevels.findIndex(level => Math.abs(level - DEFAULT_ZOOM_SCALE) < 1e-9);
        if (this.currentZoomIndex === -1) { // Fallback if default not exactly in levels
            this.currentZoomIndex = Math.floor(this.zoomLevels.length / 2);
        }
        this.scale = this.zoomLevels[this.currentZoomIndex];
        // Use requestAnimationFrame to ensure layout is stable before centering
        requestAnimationFrame(() => {
            this.centerDiagram();
            setTimeout(() => this.content.classList.remove(CSS_CLASSES.ZOOMING), ZOOM_ANIMATION_CLASS_TIMEOUT_MS);
        });
    }

    async copyCode() {
        try {
            await navigator.clipboard.writeText(this.mermaidCode);
            this.showNotification('Copied!');
        } catch (error) {
            // Fallback for older browsers or if clipboard API fails
            console.error('Clipboard API copy failed, attempting fallback:', error);
            const textArea = document.createElement('textarea');
            textArea.value = this.mermaidCode;
            // Style to make it invisible
            textArea.style.position = 'fixed';
            textArea.style.top = '-9999px';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showNotification('Copied!');
            } catch (copyError) {
                console.error('Fallback copy failed:', copyError);
                this.showNotification('Copy failed.', true); // Error
            }
            document.body.removeChild(textArea);
        }
    }

    showNotification(message, isError = false) {
        if (window.$events) {
            const eventName = isError ? 'error' : 'success';
            window.$events.emit(eventName, message);
        } else {
            // Fallback for if the event system is not available
            console.warn('BookStack event system not found, falling back to console log for notification.');
            if (isError) {
                console.error(message);
            } else {
                console.log(message);
            }
        }
    }

    destroy() {
        // Abort all listeners attached with this controller's signal.
        this.abortController.abort();
        this.container.innerHTML = ''; // Clear the container's content
    }
}

const mermaidViewers = [];
function initializeMermaidViewers() {
    const codeBlocks = document.querySelectorAll('.content-wrap > .page-content pre code.language-mermaid');
    for (const codeBlock of codeBlocks) {
        // Ensure we don't re-initialize if this script runs multiple times or content is dynamic
        if (codeBlock.dataset.mermaidViewerInitialized) continue;

        const mermaidCode = codeBlock.textContent || codeBlock.innerHTML; // textContent is usually better
        const container = document.createElement('div');
        container.className = CSS_CLASSES.CONTAINER;


        const replaceTarget = (codeBlock.nodeName === 'CODE') ? codeBlock.parentElement : codeBlock;
        const targetBounds = replaceTarget.getBoundingClientRect();

        // Check if replaceTarget is already a mermaid-container (e.g. from previous init)
        if (replaceTarget.classList.contains(CSS_CLASSES.CONTAINER)) continue;

        container.style.height = `${targetBounds.height}px`;
        replaceTarget.after(container);
        replaceTarget.remove(); // Remove the original <pre> or <pre><code> block

        const viewer = new InteractiveMermaidViewer(container, mermaidCode);
        mermaidViewers.push(viewer);
        codeBlock.dataset.mermaidViewerInitialized = 'true'; // Mark as initialized
    }
}

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMermaidViewers);
} else {
    // DOMContentLoaded has already fired
    initializeMermaidViewers();
}

const recenterAllViewers = () => mermaidViewers.forEach(viewer => viewer.centerDiagram());

// Re-center diagrams on window load and window resize, as images/fonts inside SVG might affect size
window.addEventListener('load', () => {
    // Delay slightly to ensure mermaid rendering is fully complete and dimensions are stable
    setTimeout(recenterAllViewers, 100);
});

window.addEventListener('resize', recenterAllViewers);