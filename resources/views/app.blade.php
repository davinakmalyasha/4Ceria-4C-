<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>4C Project</title>
    <!-- Google Fonts Preconnect & Async Load -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link 
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" 
        rel="stylesheet" 
        media="print" 
        onload="this.media='all'" 
    />
    @viteReactRefresh
    {{-- `resources/css/app.css` is imported by `resources/js/app.tsx`, so the
         manifest has no separate entry for it. Listing it here would throw
         "Unable to locate file in Vite manifest" once it was removed from
         `rollupOptions.input`. The Tailwind CSS and the project theme are
         emitted as one stylesheet, in the order app.tsx imports them:
         Tailwind first, `index.css` second (its `z-index: 1000` on
         `.custom-navbar-container` has to beat the `z-100` utility). --}}
    @vite(['resources/js/app.tsx'])
</head>
<body class="antialiased">
    <div id="root"></div>
</body>
</html>
