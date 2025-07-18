<?php

use BookStack\Facades\Theme;
use BookStack\Theming\ThemeEvents;

// Update the application configuration to allow diagrams.net
// viewer as an approved iframe source.
Theme::listen(ThemeEvents::APP_BOOT, function () {
    $iframeSources = config()->get('app.iframe_sources');
    $iframeSources .= ' https://viewer.diagrams.net';
    config()->set('app.iframe_sources', $iframeSources);
});