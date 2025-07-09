{{-- This is a placeholder template file provided as a --}}
{{-- convenience to users of the visual theme system. --}}
{{-- Only include on page related views --}}
@if(request()->fullUrlIs('*/page/*'))
    {{--External Requirements--}}
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
          integrity="sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg=="
          crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.7.0/mermaid.min.js"
            integrity="sha512-ecc+vlmmc1f51s2l/AeIC552wULnv9Q8bYJ4FbODxsL6jGrFoLaKnGkN5JUZNH6LBjkAYy9Q4fKqyTuFUIvvFA=="
            crossorigin="anonymous" defer referrerpolicy="no-referrer" nonce="{{ $cspNonce ?? '' }}"></script>
    {{--Use files from theme folder--}}
    <link rel="stylesheet" href="{{ url('/mermaid-viewer.css') }}">
    <script src="{{ url('/mermaid-viewer.js') }}" type="module" nonce="{{ $cspNonce ?? '' }}"></script>
@endif

<script type="module" nonce="{{ $cspNonce ?? '' }}">
    /**
     * This script performs the following:
     * - Finds drawings within page content on page view.
     * - Fetches the data for those PNG-based drawings.
     * - Extracts out the diagrams.net drawing data from the PNG data.
     * - Builds embedded "viewer" iframes for the drawings.
     * - Replaces the original drawings with embedded viewers.
     */

    /**
     * Reads a given PNG data text chunk and returns drawing data if found.
     * @param {Uint8Array} textData
     * @returns {string|null}
     */
    function readTextChunkForDrawing(textData) {
        const start = String.fromCharCode(...textData.slice(0, 7));
        if (start !== "mxfile\0") {
            return null;
        }

        const drawingText = String.fromCharCode(...textData.slice(7));
        return decodeURIComponent(drawingText);
    }

    /**
     * Attempts to extract drawing data from a PNG image.
     * @param {Uint8Array} pngData
     * @returns {string}
     */
    function extractDrawingFromPngData(pngData) {
        // Ensure the file appears to be valid PNG file data
        const signature = pngData.slice(0, 8).join(',');
        if (signature !== '137,80,78,71,13,10,26,10') {
            throw new Error('Invalid png signature');
        }

        // Search through the chunks of data within the PNG file
        const dataView = new DataView(pngData.buffer);
        let offset = 8;
        let searching = true;
        while (searching && offset < pngData.length) {
            const length = dataView.getUint32(offset);
            const chunkType = String.fromCharCode(...pngData.slice(offset + 4, offset + 8));

            if (chunkType === 'tEXt') {
                // Extract and return drawing data if found within a text data chunk
                const textData = pngData.slice(offset + 8, offset + 8 + length);
                const drawingData = readTextChunkForDrawing(textData);
                if (drawingData !== null) {
                    return drawingData;
                }
            } else if (chunkType === 'IEND') {
                searching = false;
            }

            offset += 12 + length; // 12 = length + type + crc bytes
        }

        return '';
    }

    /**
     * Creates an iframe-based viewer for the given drawing data.
     * @param {string} drawingData
     * @returns {HTMLElement}
     */
    function createViewerContainer(drawingData) {
        const params = {
            lightbox: '0',
            highlight: '0000ff',
            layers: '1',
            nav: '1',
            dark: 'auto',
            toolbar: '1',
        };

        const query = (new URLSearchParams(params)).toString();
        const hash = `R${encodeURIComponent(drawingData)}`;
        const url = `https://viewer.diagrams.net/?${query}#${hash}`;

        const el = document.createElement('iframe');
        el.classList.add('mxgraph');
        el.style.width = '100%';
        el.style.maxWidth = '100%';
        el.src = url;
        el.frameBorder = '0';
        return el;
    }

    /**
     * Swap the given original drawing wrapper with the given viewer iframe.
     * Attempts to somewhat match sizing based on original drawing size, but
     * extra height is given to account for the viewer toolbar/UI.
     * @param {HTMLElement} wrapper
     * @param {HTMLElement} viewer
     */
    function swapDrawingWithViewer(wrapper, viewer) {
        const size = wrapper.getBoundingClientRect();
        viewer.style.height = (Math.round(size.height) + 146) + 'px';
        wrapper.replaceWith(viewer);
    }

    /**
     * Attempt to make a drawing interactive by converting it to an embedded iframe.
     * @param {HTMLElement} wrapper
     * @returns Promise<void>
     */
    async function makeDrawingInteractive(wrapper) {
        const drawingUrl = wrapper.querySelector('img')?.src;
        if (!drawingUrl) {
            return;
        }

        const drawingPngData = await (await fetch(drawingUrl)).bytes();
        const drawingData = extractDrawingFromPngData(drawingPngData);
        if (!drawingData) {
            return;
        }

        const viewer = createViewerContainer(drawingData);
        swapDrawingWithViewer(wrapper, viewer);
    }

    // Cycle through found drawings on a page and update them to make them interactive
    const drawings = document.querySelectorAll('.page-content [drawio-diagram]');
    for (const drawingWrap of drawings) {
        makeDrawingInteractive(drawingWrap);
    }
</script>
