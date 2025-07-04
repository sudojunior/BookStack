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
    <link rel="stylesheet" href="{{ url('/theme/' . \BookStack\Facades\Theme::getTheme() . '/mermaid-viewer.css') }}">
    <script src="{{ url('/theme/' . \BookStack\Facades\Theme::getTheme() . '/mermaid-viewer.js') }}" type="module" nonce="{{ $cspNonce ?? '' }}"></script>
@endif